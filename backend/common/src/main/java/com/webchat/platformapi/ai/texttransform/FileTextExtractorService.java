package com.webchat.platformapi.ai.texttransform;

import com.webchat.platformapi.ai.multimodal.MultimodalUploadProperties;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Service
public class FileTextExtractorService {

    private static final Logger log = LoggerFactory.getLogger(FileTextExtractorService.class);

    private static final int MAX_EXCEL_ROWS = 10_000;

    private final MultimodalUploadProperties properties;

    public FileTextExtractorService(MultimodalUploadProperties properties) {
        this.properties = properties;
    }

    public record ExtractResult(boolean success, String text, String fileName, int charCount, String error) {

        public static ExtractResult ok(String text, String fileName, int charCount) {
            return new ExtractResult(true, text, fileName, charCount, null);
        }

        public static ExtractResult error(String error) {
            return new ExtractResult(false, null, null, 0, error);
        }
    }

    public ExtractResult extract(byte[] content, String originalName, String mimeType) {
        if (content == null || content.length == 0) {
            return ExtractResult.error("file is empty");
        }

        String name = originalName == null ? "file" : originalName;
        String lower = name.toLowerCase(Locale.ROOT);
        int maxChars = properties.getMaxDocumentChars();

        try {
            String text;
            if (lower.endsWith(".pdf") || "application/pdf".equals(mimeType)) {
                text = extractPdf(content);
            } else if (lower.endsWith(".docx") || "application/vnd.openxmlformats-officedocument.wordprocessingml.document".equals(mimeType)) {
                text = extractDocx(content);
            } else if (lower.endsWith(".doc") || "application/msword".equals(mimeType)) {
                text = extractDoc(content);
            } else if (lower.endsWith(".xlsx") || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mimeType)) {
                text = extractExcel(content);
            } else if (lower.endsWith(".xls") || "application/vnd.ms-excel".equals(mimeType)) {
                text = extractExcel(content);
            } else if (lower.endsWith(".txt") || "text/plain".equals(mimeType)) {
                text = new String(content, StandardCharsets.UTF_8);
            } else {
                text = new String(content, StandardCharsets.UTF_8);
            }

            String trimmed = text == null ? "" : text.trim();
            if (trimmed.isEmpty()) {
                return ExtractResult.error("extracted text is empty");
            }
            if (trimmed.length() > maxChars) {
                trimmed = trimmed.substring(0, maxChars);
            }
            return ExtractResult.ok(trimmed, name, trimmed.length());
        } catch (Exception e) {
            log.warn("[file-extract] failed for {}: {}", name, e.getMessage());
            return ExtractResult.error("document extraction failed: " + (e.getMessage() == null ? "unknown error" : e.getMessage()));
        }
    }

    private String extractPdf(byte[] content) throws Exception {
        try (PDDocument doc = Loader.loadPDF(content)) {
            return new PDFTextStripper().getText(doc);
        }
    }

    private String extractDocx(byte[] content) throws Exception {
        try (InputStream is = new ByteArrayInputStream(content);
             XWPFDocument doc = new XWPFDocument(is)) {
            StringBuilder sb = new StringBuilder();
            for (XWPFParagraph p : doc.getParagraphs()) {
                String text = p.getText();
                if (text != null && !text.isEmpty()) {
                    if (!sb.isEmpty()) sb.append('\n');
                    sb.append(text);
                }
            }
            return sb.toString();
        }
    }

    private String extractDoc(byte[] content) throws Exception {
        try (InputStream is = new ByteArrayInputStream(content);
             HWPFDocument doc = new HWPFDocument(is)) {
            WordExtractor extractor = new WordExtractor(doc);
            return extractor.getText();
        }
    }

    private String extractExcel(byte[] content) throws Exception {
        try (InputStream is = new ByteArrayInputStream(content);
             Workbook wb = WorkbookFactory.create(is)) {
            StringBuilder sb = new StringBuilder();
            int totalRows = 0;
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                Sheet sheet = wb.getSheetAt(s);
                String sheetName = sheet.getSheetName();
                if (!sb.isEmpty()) sb.append("\n\n");
                sb.append("--- Sheet: ").append(sheetName).append(" ---\n");
                for (Row row : sheet) {
                    if (totalRows >= MAX_EXCEL_ROWS) {
                        sb.append("\n[truncated: exceeded ").append(MAX_EXCEL_ROWS).append(" rows]");
                        return sb.toString();
                    }
                    StringBuilder rowSb = new StringBuilder();
                    for (Cell cell : row) {
                        if (!rowSb.isEmpty()) rowSb.append('\t');
                        rowSb.append(cellToString(cell));
                    }
                    String rowText = rowSb.toString().trim();
                    if (!rowText.isEmpty()) {
                        sb.append(rowText).append('\n');
                    }
                    totalRows++;
                }
            }
            return sb.toString();
        }
    }

    private static String cellToString(Cell cell) {
        if (cell == null) return "";
        CellType type = cell.getCellType();
        if (type == CellType.FORMULA) {
            type = cell.getCachedFormulaResultType();
        }
        return switch (type) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                double v = cell.getNumericCellValue();
                if (v == Math.floor(v) && !Double.isInfinite(v)) {
                    yield String.valueOf((long) v);
                }
                yield String.valueOf(v);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case BLANK -> "";
            default -> "";
        };
    }
}
