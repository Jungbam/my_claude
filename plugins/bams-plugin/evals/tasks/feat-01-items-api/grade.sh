#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"; exec "$D/../../lib/grade_code.sh" "$D" "${1:?usage: grade.sh <work_dir>}"
