#!/bin/bash
# Baixa o Node para Android (ARM 64 bits) e as bibliotecas de que ele depende, dos pacotes do
# projeto Termux, confere a integridade de cada pacote (SHA-256 fixado aqui) e põe no app:
#   app/src/main/jniLibs/arm64-v8a/libnode.so   o programa `node` (o Android só executa programas
#                                               que estão nessa pasta e se chamam lib*.so)
#   app/src/main/assets/no/lib/                 as bibliotecas (.so) que o `node` carrega
#
# Por que o Node do Termux: é o Node completo (com acentos, datas e fusos: ICU), da mesma geração
# do que roda no Mac. O nodejs-mobile (Node 18) vem sem ICU e o robô compararia nomes errado.
#
# Para atualizar: troque VERSÃO/SHA abaixo pelos do índice
#   https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages
# O Termux apaga versões antigas do servidor; a cópia baixada fica em ~/Library/Caches/pelada-android.
set -euo pipefail
cd "$(dirname "$0")/.."

ESPELHO="${TERMUX_ESPELHO:-https://packages.termux.dev/apt/termux-main}"
CACHE="${PELADA_ANDROID_CACHE:-$HOME/Library/Caches/pelada-android}/termux"

# caminho-no-espelho  sha256
PACOTES=(
  "pool/main/n/nodejs-lts/nodejs-lts_24.22.3_aarch64.deb 80edcc73db025db0baa09be27e3d65a16e6f2a72ab925f1873a1b808ab857c28"
  "pool/main/libi/libicu/libicu_79.1_aarch64.deb 83c980a010e957738e3567127801d66a1b9bd7e404a4fda98788048ee57d606c"
  "pool/main/o/openssl/openssl_1:3.6.5_aarch64.deb a2fb7856875e63ef6b90442752e05974813372c3ca86d2513a78ea43c67a0f8b"
  "pool/main/c/c-ares/c-ares_1.34.9_aarch64.deb 623d84855e176f3f2a415d24c0e1d2f529356f4b5439bb3313e6d7ff0da4585c"
  "pool/main/z/zlib/zlib_1.4_aarch64.deb e3027565ae50bcd8ba5113c988b589754ae192c9cc3e6afbe3e4ed7c06b2598e"
  "pool/main/libc/libc++/libc++_30_aarch64.deb 53d0b84a7ba7459024257cb94d5b136fe13ef858567f65a8064b35950799f2ca"
  "pool/main/libs/libsqlite/libsqlite_3.54.1-1_aarch64.deb 661fb995f7215845007b222a85266ae99d9443e87e0604f8677edfd738e6b81a"
)
# As bibliotecas que o `node` pede (llvm-readelf -d node | grep NEEDED), mais a libicudata (pedida pela libicuuc).
BIBLIOTECAS=(libz.so.1 libcares.so libsqlite3.so libcrypto.so.3 libssl.so.3 libicui18n.so.79 libicuuc.so.79 libicudata.so.79 libc++_shared.so)

mkdir -p "$CACHE/debs"
RAIZ="$(mktemp -d)"
trap 'rm -rf "$RAIZ"' EXIT

for linha in "${PACOTES[@]}"; do
  caminho="${linha% *}"
  sha="${linha##* }"
  arquivo="$CACHE/debs/$(basename "$caminho")"
  if [ ! -f "$arquivo" ] || [ "$(shasum -a 256 "$arquivo" | cut -d' ' -f1)" != "$sha" ]; then
    url="$ESPELHO/$(printf '%s' "$caminho" | sed 's/+/%2B/g; s/:/%3A/g')"
    echo "baixando $(basename "$caminho")"
    curl -fsSL --max-time 600 -o "$arquivo" "$url"
  fi
  if [ "$(shasum -a 256 "$arquivo" | cut -d' ' -f1)" != "$sha" ]; then
    echo "ERRO: $(basename "$caminho") não bate com o SHA-256 esperado; nada foi instalado." >&2
    exit 1
  fi
  # Um .deb é um arquivo `ar` com um data.tar.* dentro; o tar do macOS lê os dois.
  dentro="$(mktemp -d)"
  tar -xf "$arquivo" -C "$dentro"
  tar -xf "$dentro"/data.tar.* -C "$RAIZ"
  rm -rf "$dentro"
done

USR="$RAIZ/data/data/com.termux/files/usr"
test -f "$USR/bin/node"
DESTINO_PROGRAMA="app/src/main/jniLibs/arm64-v8a"
DESTINO_LIBS="app/src/main/assets/no/lib"
rm -rf "$DESTINO_LIBS"
mkdir -p "$DESTINO_PROGRAMA" "$DESTINO_LIBS"
cp "$USR/bin/node" "$DESTINO_PROGRAMA/libnode.so"
for b in "${BIBLIOTECAS[@]}"; do
  cp -L "$USR/lib/$b" "$DESTINO_LIBS/$b"
done
# Muda quando qualquer pacote muda: o app usa para saber se precisa copiar as bibliotecas de novo.
printf '%s\n' "${PACOTES[@]}" | shasum -a 256 | cut -c1-16 > "$DESTINO_LIBS/../versao"
echo "node pronto: $DESTINO_PROGRAMA/libnode.so + ${#BIBLIOTECAS[@]} bibliotecas em $DESTINO_LIBS"
