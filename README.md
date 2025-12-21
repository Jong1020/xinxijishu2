# IT Exam Auto-Grader (信息技术考试自动评分系统)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

这是一个基于 React 19 和 Google Gemini / DeepSeek 大模型的现代化阅卷系统。它能够直接分析 Word (`.docx`) 文档底层的 XML 结构，实现对信息技术上机操作题的自动化、高精度评分。

## ✨ 核心特性

*   **差异化对比评分**: 支持上传“原始素材”，AI 对比学生作业与原始文档的差异（如字体修改、段落调整），而非仅检查最终结果。
*   **多模型支持**: 内置支持 Google Gemini 3.0/2.0 和 DeepSeek V3/R1。
*   **隐私安全**: 所有文件解析在浏览器本地完成，仅发送脱敏的 XML 片段给 AI。
*   **批量处理**: 支持 ZIP 压缩包批量导入与高并发阅卷。

## 🚀 快速开始 (本地开发)

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/your-username/it-exam-auto-grader.git
    cd it-exam-auto-grader
    ```

2.  **安装依赖**:
    ```bash
    npm install
    ```

3.  **配置环境变量**:
    在项目根目录创建一个 `.env` 文件，并填入你的 API Key（**注意：不要将此文件提交到 GitHub**）。

    ```env
    # Google Gemini API Key
    API_KEY=your_google_api_key_here

    # DeepSeek API Key (可选，如果使用 DeepSeek 模型)
    DEEPSEEK_API_KEY=your_deepseek_api_key_here
    ```

4.  **启动开发服务器**:
    ```bash
    npm run dev
    ```

## ☁️ 部署到腾讯云 (Tencent Cloud)

本项目是一个纯静态的前端应用（SPA），非常适合部署在腾讯云的 **Webify (云开发)**、**COS (对象存储静态网站)** 或 **CVM (云服务器)** 上。

### 方式一：Webify (推荐，自动化部署)

1.  将代码推送到你的 GitHub 仓库。
2.  登录腾讯云 [Webify 控制台](https://console.cloud.tencent.com/webify)。
3.  点击“新建应用”，从 GitHub 导入本仓库。
4.  **关键步骤**：在部署配置中，设置环境变量：
    *   `API_KEY`: 填入你的 Google Gemini API Key。
    *   `DEEPSEEK_API_KEY`: 填入你的 DeepSeek Key。
5.  构建命令预设选择 `Vite` 或手动输入 `npm run build`。
6.  点击部署，等待完成后即可获得访问域名。

### 方式二：手动构建部署 (CVM/Nginx)

1.  **本地构建**:
    确保你的 `.env` 文件存在（或者在构建命令前注入变量），运行：
    ```bash
    npm run build
    ```
    这将生成一个 `dist` 目录。

2.  **上传文件**:
    将 `dist` 目录下的所有文件上传到腾讯云服务器的 Nginx 网站根目录（例如 `/usr/share/nginx/html`）。

3.  **配置 Nginx**:
    确保 Nginx 配置支持 SPA（单页应用）的路由重定向：
    ```nginx
    location / {
        try_files $uri $uri/ /index.html;
    }
    ```

## 🛠️ 技术栈

*   **Core**: React 19, TypeScript, Vite
*   **UI**: Tailwind CSS, Lucide React
*   **File Processing**: JSZip (解压), SheetJS (Excel 导出)
*   **AI SDK**: @google/genai

## ⚠️ 注意事项

*   **API Key 安全**: 本项目是纯前端项目，API Key 会在构建时注入或在运行时暴露在浏览器端。请务必限制 API Key 的使用额度或来源域名（Referer），防止被滥用。
*   **CORS**: 如果使用 DeepSeek 且直接在浏览器端调用，可能会遇到跨域问题。建议配置 Nginx 反向代理或使用支持 CORS 的中转服务。

## License

MIT