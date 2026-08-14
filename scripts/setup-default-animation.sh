#!/bin/bash
ANIM_DIR="$HOME/.ues-agent/data/animations"
DEFAULT="$ANIM_DIR/idle_loop.vrma"

if [ ! -f "$DEFAULT" ]; then
  mkdir -p "$ANIM_DIR"
  echo "Downloading default animation model..."
  curl -L -o "$DEFAULT" "https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm-animation/examples/vrma/idle_loop.vrma"
  echo "Done."
else
  echo "Default animation already exists."
fi
