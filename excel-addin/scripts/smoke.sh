#!/usr/bin/env bash
set -euo pipefail

npm run build
npm run test
npm run validate

echo "Excel add-in smoke checks passed"
