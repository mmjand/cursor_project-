# 摄影作品集（前端静态站点 + Supabase 上传）

这是一个纯静态的个人摄影网站：你可以在页面中直接上传图片（浏览器直连 Supabase Storage），并在图库中展示最近作品。

## 1. 准备 Supabase

### 1.1 创建 Storage Bucket

在 Supabase 后台打开 **Storage**：

1. 新建 bucket：`photos`
2. 建议设置为 **Public**（这样前端可以直接用公开 URL 渲染图片）
3. 添加 Storage 权限（Policy），允许匿名 `anon` 上传与读取：
   - bucket：`photos`
   - 操作：`INSERT`（上传）
   - 操作：`SELECT`（读取图片）

> 如果你不确定在 UI 里怎么设：打开 bucket 的 **Policies**，添加两条规则即可（INSERT/SELECT 分别给 `anon`）。

如果你要启用“删除作品”（见后文 `ENABLE_DELETE`），还需要额外允许：

- 操作：`DELETE`（删除对象）

### 1.2 创建数据库表（用于保存图片元数据）

在 Supabase **SQL Editor** 执行下面语句（会要求你启用 `pgcrypto`；Supabase 通常已启用）：

```sql
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  caption text,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.photos add column if not exists album text;
alter table public.photos add column if not exists tags text;

alter table public.photos enable row level security;

-- 允许公开读取
create policy "photos_select_public"
on public.photos
for select
to anon
using (true);

-- 允许公开插入（用于前端上传成功后写入元数据）
create policy "photos_insert_public"
on public.photos
for insert
to anon
with check (true);

-- 如果你启用“删除作品”，还需要允许匿名删除
-- 删除 policy 是可选的；不启用删除功能时请不要创建它
-- create policy "photos_delete_public"
-- on public.photos
-- for delete
-- to anon
-- using (true);
```

### 1.3 获取配置

在 Supabase 项目设置里找到：

- `Project URL` => `SUPABASE_URL`
- `anon public key` => `SUPABASE_ANON_KEY`

## 2. 配置前端

打开 `config.js`，把占位符替换成你的值：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

> 这里的 `anon key` 属于前端可公开使用的 key，一般可以提交到 GitHub。

同时你还可以在 `config.js` 里配置：

- `SITE_TITLE` / `SITE_SUBTITLE`：首页标题与副标题
- `THEME`：自定义配色（`accent`、`accent2`）
- `ENABLE_DELETE`：是否启用每张作品的“删除”按钮（安全风险见下）

重要安全提示：如果将 `ENABLE_DELETE` 设为 `true`，你需要确保 Storage bucket 的 `DELETE` 以及数据库表的 `DELETE` policy 只在你信任的场景下开放给 `anon`。

## 3. 本地预览

由于这是纯静态站点，你可以直接用任意静态服务器预览（浏览器直连 Supabase）。

## 4. 部署到 GitHub Pages

1. 在仓库根目录确保包含 `index.html`、`config.js`、`assets/`。
2. GitHub Pages 建议启用 **Deploy from a branch**：
   - 通常选 `main` 分支
   - 构建步骤可选为 “None”（因为无需打包）
3. 部署后把访问地址告诉 Supabase 的 CORS/Allowed origins（如果你启用了严格策略）。

## 5. 常见问题

1. 上传按钮可点但报错：多半是 Storage `INSERT` 权限或 bucket 名写错（必须是 `photos`）。
2. 上传成功但图库为空：多半是数据库表 `photos` 没建好、或 `anon` 没有 `INSERT/SELECT` 权限。
3. 图片无法显示：bucket 建成了 Private，但前端用了 `getPublicUrl`（此时应改为走签名 URL/Edge Function）。

## 6. 已支持的增强

- 上传时支持填写 `专辑/标签`
- 画面支持按“专辑/标签”筛选
- 可选支持“删除作品”（需要 Storage + DB 都允许 `DELETE`）
- 上传压缩/缩略图生成

