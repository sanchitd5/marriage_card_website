# Auto-rigging service (RigAnything, on the home Proxmox box)

An HTTP service that takes a static (unrigged) 3D mesh and returns a rigged
`.glb` — a real skeleton plus baked skinning weights, ready to load in
three.js/Blender/Unity/etc. Built to solve the exact pain point the fairy-punk
dancer rig hit repeatedly this session (manual Blender scripting, weight
painting found and fixed as separate bugs one at a time — dead-bone
vertices, wrong-region binding, axis-sign mismatches). This is **not** used
by the shipped website at runtime — it's offline tooling for preparing new
rigged assets, the same category as `gen-envelopes.mjs`/`gen-wide-assets.js`.

## Where it lives

- Host: the home Proxmox server (root@192.168.1.2 — **not** the Home
  Assistant box at 192.168.1.3 documented in `~/CLAUDE.md`; a separate
  machine on the same home network). SSH on **port 2298** (not the default
  22 — refused there). Credentials are known to the user, not duplicated
  here (same convention as the Home Assistant token in `~/CLAUDE.md`).
- The Proxmox host itself (bare metal, not a VM) has an **RTX 3090** (24GB
  VRAM) directly attached — confirmed via `nvidia-smi`, not passed through
  to any VM (`lspci -k` shows `Kernel driver in use: nvidia`, and
  `qm list` shows no running VMs).
- Project directory: `/root/riganything/` — a clone of
  [Isabella98Liu/RigAnything](https://github.com/Isabella98Liu/RigAnything)
  (SIGGRAPH TOG 2025, not to be confused with the older `zhan-xu/RigNet`),
  a diffusion-transformer model that predicts skeleton
  joints + parent hierarchy + skinning weights directly from a mesh, chosen
  specifically because — unlike the older, more commonly-cited **RigNet**
  (2020) and its direct successors (**UniRig**) — it has **no CUDA-locked
  compiled extensions** (`torch-scatter`/`torch-cluster`/`flash-attn`/`spconv`),
  so it actually installs and runs on ordinary PyTorch+CUDA. RigNet itself
  was investigated and ruled out: stale (no updates since 2023), and its
  toolchain has no macOS/Apple-Silicon path either, moot here since this
  runs on the Linux/NVIDIA box anyway, but the dependency fragility is the
  same reason it was skipped in favor of RigAnything.
- Python env: `/root/riganything/.venv` (Python 3.11 via `uv`, since Debian
  13 trixie only ships 3.13 in its main repos and RigAnything's own docs
  recommend 3.11). `uv` itself is installed at `~/.local/bin/uv` on that host.
- Pretrained checkpoint: `/root/riganything/ckpt/riganything_ckpt.pt`
  (downloaded via `hf download Isabellaliu/RigAnything --local-dir ckpt/`).

## Running it

**Currently running as a plain background process** (`nohup uvicorn ... &`,
logs at `/root/riganything/server.log`), **not** a systemd unit — writing to
`/etc/systemd/system/` was blocked by Claude Code's auto-mode safety
classifier as a more sensitive action than plain SSH commands, and wasn't
pursued further this session. Practical implication: **this will not
automatically restart if the Proxmox host reboots.** If it's down after a
reboot, from the repo dir on that host:

```sh
cd /root/riganything && source .venv/bin/activate
nohup uvicorn rig_server:app --host 0.0.0.0 --port 8199 > server.log 2>&1 < /dev/null &
disown
```

(Chaining a `sleep`/`curl` after the `&` in the SAME ssh invocation can hang
the ssh session even with `nohup` + full fd redirection — a known gotcha.
Verify it came up with a **separate**, fresh `ssh ... curl .../health` call
instead.)

To make it a real persistent systemd service instead (recommended if this
sees ongoing use — survives reboots, gets crash-restarted automatically),
someone with shell access to that box (or a future Claude Code session with
systemd-file-write permission granted) needs to add a unit file:

```ini
# /etc/systemd/system/riganything.service
[Unit]
Description=RigAnything auto-rigging service
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/riganything
ExecStart=/root/riganything/.venv/bin/uvicorn rig_server:app --host 0.0.0.0 --port 8199
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
then `systemctl daemon-reload && systemctl enable --now riganything.service`.

## API

Base URL: `http://192.168.1.2:8199` (only reachable from the home network —
not exposed to the internet).

- `GET /health` — `{"status": "ok", "cuda_available": true, "device": "NVIDIA GeForce RTX 3090"}`
- `GET /` — endpoint list
- `POST /rig` — multipart upload, field name `mesh`, accepts `.glb`/`.gltf`/`.obj`/`.fbx`.
  Returns the rigged `.glb` as the response body. Example:

  ```sh
  curl -X POST http://192.168.1.2:8199/rig \
    -F "mesh=@/path/to/static_model.glb" \
    -o rigged_output.glb
  ```

  Takes roughly 20-30 seconds end to end (a few seconds of GPU inference,
  the rest is the Blender-side rig-baking + glTF export step).

## How the pipeline works internally (`/root/riganything/rig_server.py`)

Two subprocess steps per request (deliberately subprocess-isolated per
request rather than importing `bpy` in-process in a long-lived server —
`bpy` isn't designed for repeated re-init across requests, and subprocess
isolation means one bad mesh can't wedge the whole service):

1. `inference.py` — RigAnything's own CLI, run with `--set inference True`
   (the shipped `config.yaml` defaults to `inference: False`/training mode,
   which silently skips the actual rigging step and only exercises
   checkpoint/optimizer loading — easy to miss, cost real debugging time
   the first time through). Produces a `.npz` with predicted joint
   positions, parent hierarchy, and per-vertex skinning weights.
2. `inference_utils/export_rigged_glb.py` (**new file, written this
   session**, not part of upstream RigAnything) — reuses RigAnything's own
   `inference_utils/vis_skel.py` (`create_armature()` + `assign_weights()`,
   already-working rig-construction code from their visualization tooling)
   to build the actual Blender armature + vertex groups from the
   prediction, then exports straight to `.glb` in the same process (the
   Blender scene `vis_skel.main()` builds is still live in memory —
   no need to round-trip through an intermediate `.blend` file).

Verified end to end against the repo's own `data_examples/*.glb` samples:
real rigged output (confirmed via direct glTF JSON inspection — e.g. a
27-joint skeleton, 10 skinned mesh nodes for the dragon example), not just
"the script exited zero."

## Fixing a wedged GPU

If `nvidia-smi` suddenly reports "No devices found" despite `lspci -k`
still showing `Kernel driver in use: nvidia` (i.e. not a VM-passthrough
situation) and nothing in `dmesg`/`journalctl` about a crash: check for
`NVRM: kgspWaitForGfwBootOk_TU102: ... GPU may be in a bad state` in
`dmesg -T` — a known RTX-30-series GSP-firmware-wedge failure mode. A
plain kernel module reload (`modprobe -r nvidia_drm nvidia_modeset
nvidia_uvm nvidia && modprobe nvidia_drm`) does **not** fix this on its
own (confirmed by direct testing). What does: a PCIe function-level reset,
without needing a full host reboot:

```sh
modprobe -r nvidia_drm nvidia_modeset nvidia_uvm nvidia
echo 1 > /sys/bus/pci/devices/0000:2d:00.0/reset   # adjust PCI address, see `lspci | grep -i nvidia`
modprobe nvidia_drm
nvidia-smi   # should show the GPU healthy again
```

## Auto-rigging tools evaluated, for context

Researched this before building anything (repo convention: research before
implementing non-trivial changes):

- **RigNet** (SIGGRAPH/TOG 2020) — the standard academic reference, has a
  Blender addon (`bRigNet`). Ruled out: hard-depends on old
  `torch-geometric`/`torch-scatter`/`torch-cluster` builds with no
  macOS/Apple-Silicon wheels (moot for this Linux box, but also stale —
  no updates since May 2023, pretrained weights only on Google Drive).
- **UniRig** (SIGGRAPH 2025, RigNet's more direct successor) — worse for
  portability, not better: needs `spconv`+`flash_attn`, both CUDA-locked
  compiled extensions.
- **HumanRig** (CVPR 2025) — genuinely uses 2D pose-estimation (classic CV)
  as a prior for 3D skeleton estimation, the closest match to "AI +
  computer vision" auto-rigging conceptually, but is a research
  paper/dataset without a confirmed simple drop-in tool.
- **RigAnything** (SIGGRAPH TOG 2025) — chosen: clean dependency list (see
  `requirements.txt`), no CUDA-locked extensions, and directly verified
  working end to end on real hardware.
