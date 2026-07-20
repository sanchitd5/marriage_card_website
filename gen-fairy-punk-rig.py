#!/usr/bin/env python3
"""Deterministic fairy-punk re-rig: fresh 21-bone skeleton + region-gated
nearest-segment envelope weights, built in pure Python from the current
asset's (correct, textured) geometry. No Blender -> no re-import corruption.

Skeleton (glTF Y-up world head positions), all identity-rotation, translation
only, so bindQ = identity for every bone and the retarget engine's local axes
are world-aligned (X=right, Y=up, Z=fwd). Arm bones follow the mesh A-pose so
the arms actually deform (the old rig had them dead-bound to Chest).
"""
import json, base64, struct, os, math, sys, copy

SRC = 'assets/scene/fairy-punk/scene.gltf'
OUT_GLTF = 'assets/scene/fairy-punk/scene.gltf'
OUT_BIN  = 'assets/scene/fairy-punk/scene.bin'

CT = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
NC = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def load(path):
    g=json.load(open(path)); base=os.path.dirname(path)
    bufs=[]
    for b in g['buffers']:
        u=b['uri']
        bufs.append(base64.b64decode(u.split(',',1)[1]) if u.startswith('data:') else open(os.path.join(base,u),'rb').read())
    return g,bufs

def acc(g,bufs,idx):
    a=g['accessors'][idx]; bv=g['bufferViews'][a['bufferView']]; buf=bufs[bv['buffer']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    fmt,sz=CT[a['componentType']]; nc=NC[a['type']]
    stride=bv.get('byteStride') or sz*nc
    out=[]
    for i in range(a['count']):
        vals=struct.unpack_from('<'+fmt*nc,buf,off+i*stride)
        out.append(vals if nc>1 else vals[0])
    return out

# ── skeleton definition ────────────────────────────────────────────────────
# name, parent, world head (glTF Y-up), tail (for weighting segment / leaf)
Z=0.02
BONES = [
 ('Pelvis',    None,        (0.0,  0.95, 0.02), (0.0, 1.06, 0.02)),
 ('Spine',     'Pelvis',    (0.0,  1.06, 0.02), (0.0, 1.18, 0.02)),
 ('Spine2',    'Spine',     (0.0,  1.18, 0.02), (0.0, 1.30, 0.03)),
 ('Chest',     'Spine2',    (0.0,  1.30, 0.03), (0.0, 1.42, 0.03)),
 ('UpperChest','Chest',     (0.0,  1.42, 0.03), (0.0, 1.52, 0.02)),
 ('Neck',      'UpperChest',(0.0,  1.52, 0.02), (0.0, 1.62, 0.01)),
 ('Head',      'Neck',      (0.0,  1.62, 0.01), (0.0, 1.90, 0.01)),
 ('Shoulder.L','UpperChest',(-0.07, 1.44, 0.03), (-0.26, 1.30, 0.04)),
 ('UpperArm.L','Shoulder.L',(-0.26, 1.30, 0.04), (-0.42, 1.10,-0.05)),
 ('Forearm.L', 'UpperArm.L',(-0.42, 1.10,-0.05), (-0.475,1.00,-0.13)),
 ('Hand.L',    'Forearm.L', (-0.475,1.00,-0.13), (-0.505,0.955,-0.14)),
 ('Fingers.L', 'Hand.L',    (-0.505,0.955,-0.14),(-0.520,0.905,-0.145)),
 ('Shoulder.R','UpperChest',( 0.07, 1.44, 0.03), ( 0.26, 1.30, 0.04)),
 ('UpperArm.R','Shoulder.R',( 0.26, 1.30, 0.04), ( 0.42, 1.10,-0.05)),
 ('Forearm.R', 'UpperArm.R',( 0.42, 1.10,-0.05), ( 0.475,1.00,-0.13)),
 ('Hand.R',    'Forearm.R', ( 0.475,1.00,-0.13), ( 0.505,0.955,-0.14)),
 ('Fingers.R', 'Hand.R',    ( 0.505,0.955,-0.14),( 0.520,0.905,-0.145)),
 ('Thigh.L',   'Pelvis',    (-0.11, 0.95, 0.02), (-0.11, 0.55, 0.02)),
 ('Shin.L',    'Thigh.L',   (-0.11, 0.55, 0.02), (-0.11, 0.15, 0.03)),
 ('Thigh.R',   'Pelvis',    ( 0.11, 0.95, 0.02), ( 0.11, 0.55, 0.02)),
 ('Shin.R',    'Thigh.R',   ( 0.11, 0.55, 0.02), ( 0.11, 0.15, 0.03)),
 # Secondary-motion "dangle" bones — not driven by the choreography (no
 # MOVE_TABLE role), purely by the runtime spring-bone physics in
 # kinetic-dancer.js (updateDanglers). A 2-link chain down the trailing
 # length of the hair (root under Head) and a single tip per wing/cloth
 # plate (root under Chest, at the plate's outer-bottom corner, the region
 # weight_chestwing already leaves un-gated to Shoulder — see below).
 ('HairMid',   'Head',      (0.0,  1.45, 0.07), (0.0, 1.25, 0.11)),
 ('HairTip',   'HairMid',   (0.0,  1.25, 0.11), (0.0, 1.05, 0.14)),
 ('WingTip.L', 'Chest',     (-0.44, 1.09, 0.0), (-0.50, 0.98, 0.0)),
 ('WingTip.R', 'Chest',     ( 0.44, 1.09, 0.0), ( 0.50, 0.98, 0.0)),
]
NAME2I={b[0]:i for i,b in enumerate(BONES)}
HEAD={b[0]:b[2] for b in BONES}
TAIL={b[0]:b[3] for b in BONES}

def seg_dist(p, a, b):
    ax,ay,az=a; bx,by,bz=b; px,py,pz=p
    dx,dy,dz=bx-ax,by-ay,bz-az
    L2=dx*dx+dy*dy+dz*dz
    if L2<1e-12: t=0.0
    else: t=max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/L2))
    cx,cy,cz=ax+t*dx,ay+t*dy,az+t*dz
    return math.dist((px,py,pz),(cx,cy,cz)), t

# ── per-vertex weighting: region gate -> candidate bones -> 2-nearest blend ──
ARM_L=['Shoulder.L','UpperArm.L','Forearm.L','Hand.L','Fingers.L']
ARM_R=['Shoulder.R','UpperArm.R','Forearm.R','Hand.R','Fingers.R']
TORSO=['Spine','Spine2','Chest','UpperChest','Neck']

def blend2(p, cands):
    # distances to each candidate bone segment
    ds=[(seg_dist(p, HEAD[c], TAIL[c])[0], c) for c in cands]
    ds.sort()
    d0,c0=ds[0]
    if len(ds)==1: return [(c0,1.0)]
    d1,c1=ds[1]
    # smooth blend only when the two nearest are comparably close (joint zone)
    if d1<=d0*1.6 and d1>1e-6:
        w0=d1/(d0+d1); w1=d0/(d0+d1)   # inverse-distance
        # sharpen so the nearest still dominates away from the joint
        w0,w1=w0*w0,w1*w1; s=w0+w1; return [(c0,w0/s),(c1,w1/s)]
    return [(c0,1.0)]

def arm_gate(x,y):
    # arm region: outboard + at/below shoulder height. widen threshold lower down.
    return abs(x)>0.20 and y<1.40

# Torso weighting by SMOOTH height interpolation (not rigid nearest-segment):
# each torso vert blends across the two bracketing spine bones by height, so a
# bend distributes continuously up the chain and reads as a C/S-curve instead
# of a single hinge (the adversarial review's #1 fix). Ordered low→high.
TORSO_STACK = [('Pelvis',0.95),('Spine',1.06),('Spine2',1.18),('Chest',1.30),('UpperChest',1.42),('Neck',1.52)]
def torso_interp(y):
    st=TORSO_STACK
    if y<=st[0][1]: return [(st[0][0],1.0)]
    if y>=st[-1][1]: return [(st[-1][0],1.0)]
    for i in range(len(st)-1):
        y0=st[i][1]; y1=st[i+1][1]
        if y0<=y<=y1:
            t=(y-y0)/(y1-y0)
            # smoothstep the blend so segment centres stay dominant but the
            # transition is continuous (no velocity corner between bands).
            ts=t*t*(3-2*t)
            return [(st[i][0],1-ts),(st[i+1][0],ts)]
    return [(st[-1][0],1.0)]

def weight_upper(x,y,z):
    if arm_gate(x,y):
        return blend2((x,y,z), ARM_L if x<0 else ARM_R)
    return torso_interp(y)

def weight_chestwing(x,y,z):
    # pauldron/wing plate: follows Chest/UpperChest by height; outer-high tips
    # get a little Shoulder so they move with the shoulder girdle. The
    # outer-BOTTOM corner (the free trailing edge, not near a shoulder joint)
    # instead blends onto the WingTip dangle bone for secondary sway.
    if y<=1.20 and abs(x)>0.28:
        side='L' if x<0 else 'R'
        return blend2((x,y,z), [f'WingTip.{side}','Chest'])
    cands=['Chest','UpperChest']
    if y>1.30 and abs(x)>0.30: cands=['UpperChest','Shoulder.L' if x<0 else 'Shoulder.R']
    return blend2((x,y,z), cands)

def weight_lower(x,y,z):
    if y>0.86:
        return blend2((x,y,z), ['Pelvis','Spine'] if y>1.0 else ['Pelvis'])
    side='L' if x<0 else 'R'
    return blend2((x,y,z), [f'Thigh.{side}', f'Shin.{side}', 'Pelvis'])

def weight_legs(x,y,z):
    side='L' if x<0 else 'R'
    return blend2((x,y,z), [f'Thigh.{side}', f'Shin.{side}'])

def weight_head(x,y,z):
    return [('Head',1.0)]

# Trailing hair length: smooth height-interpolated blend down a 3-link chain
# (same smoothstep technique as TORSO_STACK) so a whip/lag reads as a
# continuous curve along the hair rather than a hinge at one bone. Above the
# scalp line it's rigidly Head (topknot/hairline verts shouldn't dangle).
HAIR_STACK = [('Head',1.62),('HairMid',1.45),('HairTip',1.20)]
def hair_interp(y):
    st=HAIR_STACK
    if y>=st[0][1]: return [(st[0][0],1.0)]
    if y<=st[-1][1]: return [(st[-1][0],1.0)]
    for i in range(len(st)-1):
        y0=st[i][1]; y1=st[i+1][1]   # descending
        if y1<=y<=y0:
            t=(y0-y)/(y0-y1)
            ts=t*t*(3-2*t)
            return [(st[i][0],1-ts),(st[i+1][0],ts)]
    return [(st[-1][0],1.0)]

def weight_hair(x,y,z):
    return hair_interp(y)

MESH_WEIGHT={
 'BilloXD Chest': weight_chestwing,
 'BilloXD Face': weight_head,
 'BilloXD Hair Band': weight_head,
 'BilloXD Hairs': weight_hair,
 'BilloXD Legs': weight_legs,
 'BilloXD Lower': weight_lower,
 'BilloXD Upper': weight_upper,
}

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    g,bufs=load(SRC)
    # map mesh index -> owning node name
    meshnode={}
    for n in g['nodes']:
        if 'mesh' in n: meshnode[n['mesh']]=n.get('name')

    # ── new binary buffer, rebuilt clean ──
    blob=bytearray(); bufferViews=[]; accessors=[]
    def add_view(data, target=None):
        # 4-byte align
        while len(blob)%4: blob.append(0)
        off=len(blob); blob.extend(data)
        bv={'buffer':0,'byteLength':len(data),'byteOffset':off}
        if target: bv['target']=target
        bufferViews.append(bv); return len(bufferViews)-1
    def add_acc(data, comp, typ, count, mn=None, mx=None, target=None):
        bv=add_view(data, target)
        a={'bufferView':bv,'componentType':comp,'count':count,'type':typ}
        if mn is not None: a['min']=mn; a['max']=mx
        accessors.append(a); return len(accessors)-1

    # IBM accessor (one MAT4 per joint, column-major, translate(-head))
    ibm=bytearray()
    for name,_,head,_ in BONES:
        m=[1,0,0,0, 0,1,0,0, 0,0,1,0, -head[0],-head[1],-head[2],1]
        ibm.extend(struct.pack('<16f',*m))
    ibm_acc=add_acc(bytes(ibm),5126,'MAT4',len(BONES))

    new_meshes=[]
    for mi,m in enumerate(g['meshes']):
        prim=m['primitives'][0]; at=prim['attributes']
        pos=acc(g,bufs,at['POSITION'])
        nrm=acc(g,bufs,at['NORMAL'])
        uv =acc(g,bufs,at['TEXCOORD_0'])
        idx=acc(g,bufs,prim['indices'])
        nn=meshnode[mi]; wf=MESH_WEIGHT[nn]
        # POSITION
        pd=bytearray();
        for v in pos: pd.extend(struct.pack('<3f',*v))
        xs=[v[0] for v in pos]; ys=[v[1] for v in pos]; zs=[v[2] for v in pos]
        pa=add_acc(bytes(pd),5126,'VEC3',len(pos),[min(xs),min(ys),min(zs)],[max(xs),max(ys),max(zs)],34962)
        nd=bytearray()
        for v in nrm: nd.extend(struct.pack('<3f',*v))
        na=add_acc(bytes(nd),5126,'VEC3',len(nrm),target=34962)
        ud=bytearray()
        for v in uv: ud.extend(struct.pack('<2f',*v))
        ua=add_acc(bytes(ud),5126,'VEC2',len(uv),target=34962)
        # JOINTS_0 / WEIGHTS_0
        jd=bytearray(); wd=bytearray()
        for v in pos:
            ws=wf(v[0],v[1],v[2])
            ws=sorted(ws,key=lambda t:-t[1])[:4]
            s=sum(w for _,w in ws) or 1.0
            js=[NAME2I[n_] for n_,_ in ws]; wv=[w/s for _,w in ws]
            while len(js)<4: js.append(0); wv.append(0.0)
            jd.extend(struct.pack('<4B',*js))
            wd.extend(struct.pack('<4f',*wv))
        ja=add_acc(bytes(jd),5121,'VEC4',len(pos),target=34962)
        wa=add_acc(bytes(wd),5126,'VEC4',len(pos),target=34962)
        # indices
        id_=bytearray()
        for i in idx: id_.extend(struct.pack('<H',i))
        ia=add_acc(bytes(id_),5123,'SCALAR',len(idx),target=34963)
        nm=copy.deepcopy(m)
        nm['primitives'][0]['attributes']={'POSITION':pa,'NORMAL':na,'TEXCOORD_0':ua,'JOINTS_0':ja,'WEIGHTS_0':wa}
        nm['primitives'][0]['indices']=ia
        new_meshes.append(nm)

    # ── nodes: meshes (skinned) + bones + armature root ──
    nodes=[]
    # mesh nodes first (indices 0..6), keep original names/order
    meshnodes=[]
    for mi,m in enumerate(g['meshes']):
        nodes.append({'mesh':mi,'name':meshnode[mi],'skin':0}); meshnodes.append(len(nodes)-1)
    # bone nodes
    bone_node_idx={}
    for name,parent,head,tail in BONES:
        bone_node_idx[name]=len(nodes)
        ph=HEAD[parent] if parent else (0,0,0)
        loc=[head[0]-ph[0],head[1]-ph[1],head[2]-ph[2]]
        nodes.append({'name':name,'translation':loc})
    # children
    for name,parent,head,tail in BONES:
        kids=[bone_node_idx[c[0]] for c in BONES if c[1]==name]
        if kids: nodes[bone_node_idx[name]]['children']=kids
    # armature root holds pelvis + all mesh nodes (match current: Armature parent of meshes+pelvis)
    arm_idx=len(nodes)
    nodes.append({'name':'Armature','children':meshnodes+[bone_node_idx['Pelvis']]})

    skin={'inverseBindMatrices':ibm_acc,'joints':[bone_node_idx[b[0]] for b in BONES],'name':'Armature'}

    ng=copy.deepcopy(g)
    ng['nodes']=nodes
    ng['meshes']=new_meshes
    ng['skins']=[skin]
    ng['scenes']=[{'name':'Scene','nodes':[arm_idx]}]
    ng['scene']=0
    ng['bufferViews']=bufferViews
    ng['accessors']=accessors
    ng['buffers']=[{'byteLength':len(blob),'uri':'scene.bin'}]

    open(OUT_BIN,'wb').write(bytes(blob))
    json.dump(ng, open(OUT_GLTF,'w'), separators=(',',':'))
    print('wrote', OUT_GLTF, OUT_BIN, 'bytes=',len(blob), 'bones=',len(BONES))

if __name__=='__main__':
    main()
