# Password Manager (Local)

Extension **Chrome / Edge (Manifest V3)** quản lý mật khẩu **chỉ trên máy bạn** — không có server, không đồng bộ cloud. Giao diện tiếng Việt.

Phiên bản hiện tại: **0.9.3**

## Tính năng

- **Vault mã hóa** bằng master password (tạo / mở khóa từ popup extension).
- **Trang quản lý** (`options`): danh sách tài khoản theo website, tìm kiếm, thêm/sửa/xóa, import.
- **Autofill** trên trang web: icon tại ô đăng nhập, panel chọn tài khoản, hỗ trợ form React.
- **Lưu sau đăng nhập** (gợi ý lưu / cập nhật tài khoản, gộp trùng theo site + username).
- **Check tại web**: mở trang đăng nhập từ danh sách hoặc modal chi tiết.
- **Modal chi tiết**: copy user/pass, giữ icon mắt để xem pass tạm thời.
- **Tạo mật khẩu** khi thêm/sửa tài khoản + **lịch sử mật khẩu đã tạo** (lưu trong vault).
- **Import** file TXT (Kaspersky export), CSV, JSON.

## Bảo mật (tóm tắt)

| Thành phần | Công nghệ |
|------------|-----------|
| Master password | **Argon2id** → material 32 byte |
| Tách khóa | **HKDF-SHA256** (verifier ≠ khóa giải mã vault) |
| Dữ liệu lưu trữ | **AES-256-GCM** trong `chrome.storage.local` |
| Phiên làm việc | Khóa giải mã chỉ trong RAM service worker khi vault **đang mở** |

Lịch sử generator nằm trong payload vault (`passwordGenHistory`), không lưu plaintext riêng.

**Lưu ý:** Extension không chống được malware trên máy hoặc người khác dùng trình duyệt khi vault đang mở. Repo **private** — không commit file export Kaspersky (`.txt`, `.edb`, `kpm_*`).

## Yêu cầu

- Node.js 18+ (khuyến nghị LTS)
- Chrome hoặc Edge hỗ trợ Manifest V3

## Cài đặt (developer / unpacked)

```bash
cd extension
npm install
npm run build
```

Thư mục build (load vào trình duyệt):

`../PasswordManager-extension-v0.1.0`

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode**.
3. **Load unpacked** → chọn thư mục `PasswordManager-extension-v0.1.0`.
4. Sau mỗi lần sửa code: `npm run build` rồi bấm **Reload** extension.

Tạo lại icon PNG từ SVG:

```bash
npm run icons
```

Build watch khi dev:

```bash
npm run dev
```

## Sử dụng nhanh

1. Bấm icon extension → **tạo master password** (lần đầu) hoặc **mở khóa**.
2. Mở **Password Manager** từ menu extension hoặc trang options để quản lý tài khoản.
3. Trên website đăng nhập: dùng icon ở ô user/pass hoặc đăng nhập bình thường để được gợi ý lưu.

### Import từ Kaspersky

Xuất vault Kaspersky sang **file text** (TXT), không dùng trực tiếp file `.edb` đã mã hóa. Vào **Nhập dữ liệu** trong options và chọn file.

## Cấu trúc repo

```
PasswordManager/
├── README.md
├── extension/              # Source TypeScript + Vite
│   ├── src/
│   │   ├── background/     # Service worker, message hub
│   │   ├── content/        # Autofill, save watcher
│   │   ├── crypto/         # Argon2id, HKDF
│   │   ├── vault/          # Mã hóa, logins, lịch sử generator
│   │   ├── options/        # Dashboard
│   │   └── popup/
│   ├── public/manifest.json
│   └── options/ popup/     # HTML entry
└── PasswordManager-extension-v0.1.0/   # Output build (gitignore)
```

## Git & file local

`.gitignore` loại trừ: `node_modules/`, thư mục build, `kpm_*`, `*.txt`, `*.edb`, `pending-kpm-import.txt` — tránh đẩy nhầm dữ liệu mật khẩu thật lên remote.

## Giấy phép

Dùng nội bộ / cá nhân. Chưa khai báo license công khai — thêm sau nếu cần.
