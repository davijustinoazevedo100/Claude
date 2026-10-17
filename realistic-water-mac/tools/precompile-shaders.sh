#!/bin/sh
# Regenerates src/client/resources/assets/realistic-water/shaders/spv from the GLSL sources.
# Needs Linux or macOS, a JDK 17+ and network access to Maven Central (LWJGL shaderc for this machine).
set -e
cd "$(dirname "$0")/.."
LWJGL=3.3.6
case "$(uname -s)-$(uname -m)" in
	Linux-x86_64) NATIVES=natives-linux ;;
	Linux-aarch64) NATIVES=natives-linux-arm64 ;;
	Darwin-arm64) NATIVES=natives-macos-arm64 ;;
	Darwin-*) NATIVES=natives-macos ;;
	*) echo "run this on Linux or macOS" >&2; exit 1 ;;
esac
LIB=build/shader-precompiler/lib
OUT=build/shader-precompiler/classes
mkdir -p "$LIB" "$OUT"
for jar in lwjgl-$LWJGL lwjgl-$LWJGL-$NATIVES lwjgl-shaderc-$LWJGL lwjgl-shaderc-$LWJGL-$NATIVES; do
	artifact=$(echo "$jar" | sed "s/-$LWJGL.*//")
	[ -f "$LIB/$jar.jar" ] || curl -fsSL --retry 6 --retry-delay 5 -o "$LIB/$jar.jar" "https://repo1.maven.org/maven2/org/lwjgl/$artifact/$LWJGL/$jar.jar"
done
CP="$LIB/lwjgl-$LWJGL.jar:$LIB/lwjgl-$LWJGL-$NATIVES.jar:$LIB/lwjgl-shaderc-$LWJGL.jar:$LIB/lwjgl-shaderc-$LWJGL-$NATIVES.jar"
javac --release 17 -d "$OUT" -cp "$CP" src/client/java/me/skaffy/client/vk/ShaderSource.java tools/shader-precompiler/ShaderPrecompiler.java
java -cp "$OUT:$CP:src/client/resources" ShaderPrecompiler src/client/resources/assets/realistic-water/shaders/spv
