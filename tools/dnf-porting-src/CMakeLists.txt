cmake_minimum_required(VERSION 3.10)
project(dnf-extract)

set(CMAKE_CXX_STANDARD 17)

file(GLOB SRC *.cpp *.h)

add_executable(dnf-extract ${SRC})

# Platform-specific dependencies
if(WIN32)
    # MinGW sysroot
    set(MINGW_SYSROOT "C:/ProgramData/mingw64/mingw64/x86_64-w64-mingw32")
    if(EXISTS ${MINGW_SYSROOT})
        target_include_directories(dnf-extract PRIVATE ${MINGW_SYSROOT}/include)
        target_link_directories(dnf-extract PRIVATE ${MINGW_SYSROOT}/lib)
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
