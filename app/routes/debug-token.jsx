// app/routes/debug-token.jsx
import { json } from "@remix-run/node";
import { PrismaClient } from '@prisma/client';

export async function loader() {
  const logs = [];
  
  try {
    logs.push('1. ✅ 开始调试...');
    
    // 1. 检查环境变量
    logs.push(`2. 环境变量检查:`);
    logs.push(`   - DATABASE_URL: ${process.env.DATABASE_URL ? '已设置' : '未设置'}`);
    logs.push(`   - NODE_ENV: ${process.env.NODE_ENV}`);
    
    if (!process.env.DATABASE_URL) {
      return json({ 
        success: false, 
        logs,
        error: 'DATABASE_URL 未设置' 
      });
    }
    
    // 2. 测试数据库连接
    logs.push('3. 🔧 测试数据库连接...');
    const prisma = new PrismaClient();
    
    try {
      // 简单查询测试
      await prisma.$queryRaw`SELECT 1`;
      logs.push('   ✅ 数据库连接成功');
      
      // 3. 检查ShopfrontToken表
      logs.push('4. 📋 检查ShopfrontToken表...');
      
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'ShopfrontToken'
        )
      `;
      
      logs.push(`   - 表存在: ${tableExists[0]?.exists ? '是' : '否'}`);
      
      if (tableExists[0]?.exists) {
        // 查看表结构和数据
        const columns = await prisma.$queryRaw`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'ShopfrontToken'
        `;
        
        logs.push(`   - 表结构: ${columns.map(c => c.column_name).join(', ')}`);
        
        const data = await prisma.shopfrontToken.findMany();
        logs.push(`   - 数据条数: ${data.length}`);
        
        if (data.length > 0) {
          logs.push(`   - 第一条数据: ${JSON.stringify(data[0], null, 2)}`);
        }
      }
      
      await prisma.$disconnect();
      
    } catch (dbError) {
      logs.push(`   ❌ 数据库错误: ${dbError.message}`);
      logs.push(`   ❌ 错误详情: ${JSON.stringify(dbError)}`);
      await prisma.$disconnect();
    }
    
    return json({ 
      success: true, 
      logs,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logs.push(`❌ 整体错误: ${error.message}`);
    return json({ 
      success: false, 
      logs,
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
