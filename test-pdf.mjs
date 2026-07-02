// Reproduces the pdf-parse PDFParse usage via createRequire (mirrors what resumes.ts does)
import { createRequire } from "node:module";

async function run() {
  try {
    console.log("Loading pdf-parse via createRequire...");
    const req = createRequire(import.meta.url);
    const { PDFParse } = req("pdf-parse");
    console.log("Load successful!");

    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type /Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type /Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    );

    console.log("Creating PDFParse and calling getText()...");
    const parser = new PDFParse({ data: minimalPdf });
    const result = await parser.getText();
    console.log("SUCCESS! Text:", result.text.slice(0, 80));
  } catch (err) {
    console.error("ERROR:", err.constructor?.name, err.message);
    console.error("Stack:", err.stack?.split("\n").slice(0, 10).join("\n"));
  }
}

run();
