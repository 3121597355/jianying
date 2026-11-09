# MODNet 本地人像抠图

采用 MODNet photographic 的 ONNX 转换版本，约 26 MB，Apache-2.0。模型不随源码提交；运行 npm run setup-model 下载并校验。

- 原项目：https://github.com/ZHKKKe/MODNet
- ONNX 转换及权重：https://github.com/yakhyo/modnet
- SHA-256：5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae
- 详细声明：MODNET-NOTICE.md；许可证：MODNET-LICENSE.txt

服务器执行 CPU 推理，按照片比例调整模型输入并限制计算量，再使用边缘优化与底色合成。无需生成式大模型或服务密钥。复杂发丝、眼镜和相近背景可能需要手动边缘调整；不承诺专业摄影级效果。
