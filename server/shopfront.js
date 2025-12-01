import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// 写死 code 的示例
const FIXED_CODE = "你的固定 code";

router.get("/api/get-shopfront-token", async (req, res) => {
  try {
    const response = await fetch("https://onshopfront.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
        client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
        redirect_uri: "https://plonk.onshopfront.com/",
        grant_type: "authorization_code",
        code: "def5020079a87eabd46aab4427d189b56885e02c9cda89e398ee85ef2050d671d88a182fdf4c2ae090187cfceb027164a599ffc641e0898efe16d356c593196da47418cb4c2f95526a9b96f8f2c18cd9f85b89e559cbaedd5476f943f40527f8fd0c3d2030bc8617b3581f0a11ad26dc50a89616202a6c67a6ee07c4aa1d6f968c034405758ef8ebcace27d95dad1fb05e7d58ddb203105a22f4a431b715f9ecfb420c3f59435a7c6512d8c343a52765923b41c70e06396e40a5c3d3301734af2c2d57fd8a08f6cf3f2b6edda2c9eabc7b98903a4eab6aa664c1cb545d55cb10432690db2236e1b8ac057d1e27b732620a465a29767c43afb524fe740dc18acd5c52b5c77ff9d109da53d06db4cc42d0dad39cd416bf537218a05badbfda1496058f6b29f2ae288819c1a876c70da54fbd62cc395c570a77d9871003af7c7665ca85b50d24352391ca0a60401ded9ae0e3f835187272fe0fca880ee597d9119f449bfabe9814c0a1d6f2c8c1ab64b037ca04e883514c7c51d4e84e3941ef79d2a4ceda65011a01ab36b13ff76324d77486485421a00c0e0a79ee1d4057e5ff",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    const tokens = await response.json();
    // 可以存入全局或数据库
    globalThis.shopfrontTokens = tokens;

    res.json(tokens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
