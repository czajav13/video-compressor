#!/bin/bash

INPUT_DIR="."
OUTPUT_DIR="./compressed"

mkdir -p "$OUTPUT_DIR"

for file in "$INPUT_DIR"/*.mp4; do
    [ -e "$file" ] || continue

    filename=$(basename "$file")

    ffmpeg -y \
        -i "$file" \
	-c:v libx264 \
	-crf 30 \
	-preset veryfast \
	-c:a aac \
	-b:a 96k \
        "$OUTPUT_DIR/$filename"
done
