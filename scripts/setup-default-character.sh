#!/bin/bash
CHAR_DIR="$HOME/.ues-agent/data/characters"
DEFAULT="$CHAR_DIR/default.vrm"

if [ ! -f "$DEFAULT" ]; then
  mkdir -p "$CHAR_DIR"
  echo "Downloading default character model..."
  curl -L -o "$DEFAULT" "https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"
  echo "Done."
else
  echo "Default character already exists."
fi
