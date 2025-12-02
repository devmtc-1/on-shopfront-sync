// 修改 shopfrontTokens.server.js
import prisma from "../db.server";

export const getTokens = async (vendor) => {
  const token = await prisma.shopfrontToken.findUnique({
    where: { vendor }
  });
  
  if (!token) return null;
  
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in
  };
};

export const storeAccessToken = async (vendor, tokenData) => {
  await prisma.shopfrontToken.upsert({
    where: { vendor },
    update: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      updated_at: new Date()
    },
    create: {
      vendor,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
    }
  });
};
