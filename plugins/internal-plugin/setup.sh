#!/bin/bash
#
# internal-plugin 환경변수 셋업 스크립트
# 사용법: bash setup.sh
#

set -e

PLUGIN_NAME="internal-plugin"
MARKER="# >>> ${PLUGIN_NAME} >>>"
MARKER_END="# <<< ${PLUGIN_NAME} <<<"

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "========================================="
echo "  ${PLUGIN_NAME} 환경변수 셋업"
echo "========================================="
echo ""

# --- shell profile 탐지 ---
detect_shell_profile() {
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "$(which zsh)" ]; then
        echo "${HOME}/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "$(which bash)" ]; then
        echo "${HOME}/.bashrc"
    else
        echo "${HOME}/.profile"
    fi
}

SHELL_PROFILE=$(detect_shell_profile)
echo -e "Shell profile: ${GREEN}${SHELL_PROFILE}${NC}"
echo ""

# --- 이미 설정되어 있는지 확인 ---
if grep -q "${MARKER}" "${SHELL_PROFILE}" 2>/dev/null; then
    echo -e "${YELLOW}이미 설정이 존재합니다. 덮어쓸까요?${NC}"
    read -p "(y/N): " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "취소되었습니다."
        exit 0
    fi
    # 기존 설정 제거
    sed -i.bak "/${MARKER}/,/${MARKER_END}/d" "${SHELL_PROFILE}"
    echo "기존 설정을 제거했습니다."
    echo ""
fi

# --- 환경변수 입력 ---
ENV_BLOCK="${MARKER}"

# DATAMART_HOST
echo -e "${GREEN}[1/3] Datamart (MySQL) 호스트 설정${NC}"
echo "  GCS Download 스킬에서 SEC 문서 메타데이터 조회 시 사용"
read -p "  DATAMART_HOST: " datamart_host
if [ -n "$datamart_host" ]; then
    ENV_BLOCK="${ENV_BLOCK}
export DATAMART_HOST=\"${datamart_host}\""
    echo -e "  ${GREEN}설정되었습니다.${NC}"
fi

echo ""

# DATAMART_USER
echo -e "${GREEN}[2/3] Datamart (MySQL) 사용자 설정${NC}"
read -p "  DATAMART_USER: " datamart_user
if [ -n "$datamart_user" ]; then
    ENV_BLOCK="${ENV_BLOCK}
export DATAMART_USER=\"${datamart_user}\""
    echo -e "  ${GREEN}설정되었습니다.${NC}"
fi

echo ""

# DATAMART_PASSWORD
echo -e "${GREEN}[3/3] Datamart (MySQL) 비밀번호 설정${NC}"
read -s -p "  DATAMART_PASSWORD: " datamart_pw
echo ""
if [ -n "$datamart_pw" ]; then
    # 홑따옴표 안의 홑따옴표를 '\'' 로 이스케이프
    escaped_pw="${datamart_pw//\'/\'\\\'\'}"
    ENV_BLOCK="${ENV_BLOCK}
export DATAMART_PASSWORD='${escaped_pw}'"
    echo -e "  ${GREEN}설정되었습니다.${NC}"
fi

ENV_BLOCK="${ENV_BLOCK}
${MARKER_END}"

# --- shell profile에 추가 ---
echo "" >> "${SHELL_PROFILE}"
echo "${ENV_BLOCK}" >> "${SHELL_PROFILE}"

echo ""
echo "========================================="
echo -e "  ${GREEN}설정 완료!${NC}"
echo "========================================="
echo ""
echo "적용하려면 다음 명령을 실행하세요:"
echo ""
echo -e "  ${YELLOW}source ${SHELL_PROFILE}${NC}"
echo ""
