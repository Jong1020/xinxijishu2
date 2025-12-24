import JSZip from 'jszip';
import { DocxData } from '../types';

export const parseDocx = async (file: File): Promise<DocxData> => {
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

    // Extract comments.xml (for checking interactions with comments)
    const commentsXmlFile = content.file("word/comments.xml");
    let commentsXml = "";
    if (commentsXmlFile) {
      commentsXml = await commentsXmlFile.async("string");
    }

    // Extract document.xml.rels (relationships, crucial for images/textures)
    const relsFile = content.file("word/_rels/document.xml.rels");
    let relsXml = "";
    if (relsFile) {
      relsXml = await relsFile.async("string");
    }

    // Extract numbering.xml (lists and bullets)
    const numberingFile = content.file("word/numbering.xml");
    let numberingXml = "";
    if (numberingFile) {
      numberingXml = await numberingFile.async("string");
    }

    return {
      document: documentXml,
      styles: stylesXml,
      comments: commentsXml,
      rels: relsXml,
      numbering: numberingXml
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
    // Ignore dotfiles and folder structures, allow docx/DOCX
    if (!zipEntry.dir && !relativePath.startsWith('__MACOSX') && !relativePath.startsWith('.') && (relativePath.endsWith('.docx') || relativePath.endsWith('.DOCX'))) {
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