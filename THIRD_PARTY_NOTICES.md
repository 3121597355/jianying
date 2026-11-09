# 第三方组件与素材

根目录 MIT 许可证适用于本项目自有代码。第三方组件保留各自的许可证；安装依赖时也应保留其包内声明。

| 组件 | 用途 | 许可证与来源 |
| --- | --- | --- |
| Quill 2.0.3 | 富文本编辑 | BSD-3-Clause；[源码](https://github.com/slab/quill)，见 LICENSES/Quill-BSD-3-Clause.txt、assets/vendor/quill.js.LICENSE.txt |
| html2canvas 1.4.1 | 简历 PDF 栅格化 | MIT；[源码](https://github.com/niklasvh/html2canvas)，见 LICENSES/html2canvas-MIT.txt |
| jsPDF 2.5.1 | PDF 文件生成 | MIT；[源码](https://github.com/parallax/jsPDF)，见 LICENSES/jsPDF-MIT.txt；内嵌组件的声明保留在分发文件中 |
| ONNX Runtime | CPU 模型推理 | MIT；[源码](https://github.com/microsoft/onnxruntime)，见安装包 LICENSE |
| sharp / libvips | 图片缩放、裁切和格式转换 | sharp Apache-2.0；libvips LGPL-2.1-or-later；[说明](https://sharp.pixelplumbing.com/install/#licensing)及安装包许可证 |
| MODNet photographic | 人像 alpha 遮罩 | Apache-2.0；[原项目](https://github.com/ZHKKKe/MODNet)、[ONNX 转换](https://github.com/yakhyo/modnet)，见 portrait/models/MODNET-LICENSE.txt、MODNET-NOTICE.md |
| MODNet 测试人像 | 自动化抠图测试 | 来自 yakhyo/modnet 示例；Apache-2.0；见 portrait/test/fixtures/NOTICE.md |

模型通过安装脚本从上游下载，模型权重不提交到 Git。安装脚本固定文件 SHA-256 并校验，详见 portrait/models/README.md。

首页人像为 AI 生成的虚构人物，非用户上传照片。品牌素材是生成及自制的项目视觉素材。四套标准模板由本项目渲染器和 CSS 生成，预览使用虚构履历；公开版本不包含参考网站的模板、样式或图标字体。
