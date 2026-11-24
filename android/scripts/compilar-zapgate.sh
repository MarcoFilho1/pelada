#!/bin/bash
# Compila o ZapGate para Android (ARM 64 bits) e põe no app como
#   app/src/main/jniLibs/arm64-v8a/libzapgate.so
# (o Android só executa programas que estão nessa pasta e se chamam lib*.so).
#
# Uso: ZAPGATE_DIR=/caminho/do/zapgate scripts/compilar-zapgate.sh
# Precisa de: rustup target add aarch64-linux-android  e do NDK do Android (sdkmanager "ndk;29.0.14206865").
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ZAPGATE_DIR:?Diga onde está o código do ZapGate: ZAPGATE_DIR=/caminho/do/zapgate}"
SDK="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
NDK="${ANDROID_NDK_HOME:-$(ls -d "$SDK"/ndk/* | sort | tail -1)}"
FERRAMENTAS="$(ls -d "$NDK"/toolchains/llvm/prebuilt/*/bin | head -1)"
CLANG="$FERRAMENTAS/aarch64-linux-android30-clang"
test -x "$CLANG" || { echo "ERRO: não achei o compilador do NDK em $FERRAMENTAS" >&2; exit 1; }

export PATH="$HOME/.cargo/bin:$PATH"
export CC_aarch64_linux_android="$CLANG"
export AR_aarch64_linux_android="$FERRAMENTAS/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CLANG"

DESTINO="$PWD/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$DESTINO"
(cd "$ZAPGATE_DIR" && cargo build --release --target aarch64-linux-android -p zapgate)
cp "$ZAPGATE_DIR/target/aarch64-linux-android/release/zapgate" "$DESTINO/libzapgate.so"
echo "zapgate pronto: $DESTINO/libzapgate.so ($(cd "$ZAPGATE_DIR" && git rev-parse --short HEAD))"
