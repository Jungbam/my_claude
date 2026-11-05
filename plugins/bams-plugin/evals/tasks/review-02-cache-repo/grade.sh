#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"; exec python3 -I "$D/../../lib/grade_text.py" "$D" "${1:?usage: grade.sh <work_dir>}"
