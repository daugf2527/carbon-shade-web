cmake_minimum_required(VERSION 3.10)
project(dnf-extract)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Default to Release if no build type was passed. Without this, a plain
# `cmake -G "MinGW Makefiles" ..` on Windows produced an unoptimized Debug
# binary even though the rest of the build (CI Linux paths) shipped Release.
# Honor an explicit `-DCMAKE_BUILD_TYPE=Debug` from the caller.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE "Release" CACHE STRING
        "Choose the build type: Debug Release RelWithDebInfo MinSizeRel"
        FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
        "Debug" "Release" "RelWithDebInfo" "MinSizeRel")
endif()

file(GLOB SRC *.cpp *.h)

add_executable(dnf-extract ${SRC})

# Platform-specific dependencies
if(WIN32)
    # MinGW sysroot resolution order:
    #   1. -DMINGW_SYSROOT=<path>     (explicit CMake arg)
    #   2. $ENV{MINGW_SYSROOT}        (env var — set per machine / CI)
    #   3. Probe a list of common install locations.
    # Without this, a hardcoded "C:/ProgramData/mingw64/..." silently failed
    # on every machine that installed MinGW anywhere else (MSYS2, scoop,
    # manual install, different chocolatey root).
    if(NOT MINGW_SYSROOT)
        if(DEFINED ENV{MINGW_SYSROOT})
            set(MINGW_SYSROOT "$ENV{MINGW_SYSROOT}")
        else()
            set(_mingw_candidates
                "C:/ProgramData/mingw64/mingw64/x86_64-w64-mingw32"
                "C:/ProgramData/chocolatey/lib/mingw/tools/install/mingw64/x86_64-w64-mingw32"
                "C:/msys64/mingw64/x86_64-w64-mingw32"
                "C:/mingw64/x86_64-w64-mingw32"
                "C:/MinGW/x86_64-w64-mingw32"
            )
            foreach(_p IN LISTS _mingw_candidates)
                if(EXISTS "${_p}")
                    set(MINGW_SYSROOT "${_p}")
                    break()
                endif()
            endforeach()
        endif()
    endif()

    if(MINGW_SYSROOT AND EXISTS "${MINGW_SYSROOT}")
        message(STATUS "dnf-extract: using MinGW sysroot ${MINGW_SYSROOT}")
        target_include_directories(dnf-extract PRIVATE ${MINGW_SYSROOT}/include)
        target_link_directories(dnf-extract PRIVATE ${MINGW_SYSROOT}/lib)
    else()
        message(STATUS "dnf-extract: no MinGW sysroot detected; relying on toolchain default include/lib paths")
    endif()
    target_link_libraries(dnf-extract z iconv)

    # Static-link libgcc/libstdc++/winpthread so the exe doesn't depend on
    # external DLLs at runtime. Without this, running on a machine where
    # /mingw64/bin/libstdc++-6.dll differs from the one we linked against
    # corrupts stdio (stdout/stderr handles silently fail under redirection).
    target_link_options(dnf-extract PRIVATE -static-libgcc -static-libstdc++ -static)
else()
    # Linux: zlib via find_package. Android/Termux may need a separate iconv library.
    find_package(ZLIB REQUIRED)
    target_link_libraries(dnf-extract ZLIB::ZLIB)
    if(ANDROID OR CMAKE_SYSTEM_NAME STREQUAL "Android")
        target_link_libraries(dnf-extract iconv)
    endif()
endif()

target_include_directories(dnf-extract PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
