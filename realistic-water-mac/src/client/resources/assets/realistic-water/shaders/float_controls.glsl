// Include right after #version. When the device reports shaderSignedZeroInfNanPreserveFloat32, Shaders.java defines
// RW_PRESERVE_NAN so the shader asks for IEEE NaN/Inf semantics: MoltenVK otherwise compiles with Metal fast math,
// which is allowed to drop the NaN guards that keep a blown-up particle from spreading garbage through the grid.
#ifdef RW_PRESERVE_NAN
#extension GL_EXT_spirv_intrinsics : require
spirv_execution_mode(capabilities = [4466], 4461, 32);
#endif
