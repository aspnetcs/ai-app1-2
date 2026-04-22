package com.webchat.platformapi.file;

public final class FileKind {
    private FileKind() {}

    public static final String IMAGE = "image";
    public static final String DOCUMENT = "document";
    public static final String AUDIO = "audio";
    public static final String VIDEO = "video";
    public static final String OTHER = "other";

    public static String fromMimeType(String mimeType) {
        if (mimeType == null) return OTHER;
        String t = mimeType.trim().toLowerCase(java.util.Locale.ROOT);
        if (t.startsWith("image/")) return IMAGE;
        if (t.startsWith("audio/")) return AUDIO;
        if (t.startsWith("video/")) return VIDEO;
        if (t.startsWith("text/")) return DOCUMENT;
        if (t.equals("application/pdf")) return DOCUMENT;
        if (t.contains("msword")) return DOCUMENT;
        if (t.contains("officedocument")) return DOCUMENT;
        return OTHER;
    }
}

