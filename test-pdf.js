// Reproduces the pdf-parse PDFParse usage in a Node context
async function run() {
  try {
    console.log("Starting import of pdf-parse...");
    const { PDFParse } = await import("pdf-parse");
    console.log("Import successful!");

    const fs = await import("fs");
    // Read a real PDF from the project for testing
    // Use any small PDF in data/resumes or create a minimal valid PDF buffer
    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type /Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type /Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    );
    
    console.log("Creating PDFParse instance...");
    const parser = new PDFParse({ data: minimalPdf });
    console.log("PDFParse created, calling getText()...");
    const result = await parser.getText();
    console.log("Success! Text:", result.text);
  } catch (err) {
    console.error("ERROR:", err.constructor?.name, err.message);
    console.error("Stack:", err.stack?.split("\n").slice(0, 8).join("\n"));
  }
}

run();
