package com.webchat.platformapi.file;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FileKindTest {

    @Test
    void fromMimeTypeClassifiesCommonTypes() {
        assertEquals(FileKind.IMAGE, FileKind.fromMimeType("image/png"));
        assertEquals(FileKind.AUDIO, FileKind.fromMimeType("audio/mpeg"));
        assertEquals(FileKind.VIDEO, FileKind.fromMimeType("video/mp4"));
        assertEquals(FileKind.DOCUMENT, FileKind.fromMimeType("application/pdf"));
        assertEquals(FileKind.DOCUMENT, FileKind.fromMimeType("text/plain"));
        assertEquals(FileKind.OTHER, FileKind.fromMimeType("application/octet-stream"));
        assertEquals(FileKind.OTHER, FileKind.fromMimeType(null));
    }
}

