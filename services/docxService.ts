import JSZip from 'jszip';

export const parseDocx = async (file: File): Promise<{ document: string; styles: string }> => {
  try {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);
    
    // Extract document.xml (main content)
    const documentXmlFile = content.file("word/document.xml");
    if (!documentXmlFile) {
      throw new Error("Invalid DOCX: word/document.xml not found");
    }
    const documentXml = await documentXmlFile.async("string");

    // Extract styles.xml (styling definitions)
    const stylesXmlFile = content.file("word/styles.xml");
    let stylesXml = "";
    if (stylesXmlFile) {
      stylesXml = await stylesXmlFile.async("string");
    }

    return {
      document: documentXml,
      styles: stylesXml
    };
  } catch (error) {
    console.error("Error parsing DOCX:", error);
    throw new Error("无法解析 DOCX 文件。请确保它是有效的 Microsoft Word 文档。");
  }
};

export const extractFilesFromZip = async (zipFile: File): Promise<File[]> => {
  const zip = new JSZip();
  const content = await zip.loadAsync(zipFile);
  const files: File[] = [];

  const promises: Promise<void>[] = [];

  content.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && (relativePath.endsWith('.docx') || relativePath.endsWith('.DOCX'))) {
        const promise = zipEntry.async('blob').then((blob) => {
            const extractedFile = new File([blob], relativePath.split('/').pop() || relativePath, {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
            files.push(extractedFile);
        });
        promises.push(promise);
    }
  });

  await Promise.all(promises);
  return files;
};