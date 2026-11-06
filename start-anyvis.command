#!/bin/zsh
set -e
cd "${0:A:h}"
exec /bin/zsh scripts/start-studio.command
