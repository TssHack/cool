const axios = require('axios');
const fs = require('fs');

// اطلاعات ربات
const API_URL = "https://tapi.bale.ai/bot361743011:hmO4DP2Ic7xw2QRYLhCMCmbai9KVhBmrRnKhFOA1";
const TIPAX_API = "https://open.wiki-api.ir/apis-1/TipaxInfo?code=";
const ADMIN_ID = 2143480267; // آیدی ادمین

// دیتابیس سبک
const DB_FILE = "users.json";
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

// ذخیره کاربران
function saveUsers() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// ارسال پیام
async function sendMessage(chatId, text, buttons = []) {
    try {
        const data = { chat_id: chatId, text, parse_mode: "Markdown" };
        if (buttons.length) data.reply_markup = { inline_keyboard: buttons };
        return (await axios.post(`${API_URL}/sendMessage`, data)).data.result;
    } catch (error) {
        console.error("⚠️ خطا در ارسال پیام:", error.message);
    }
}

// ویرایش پیام
async function editMessage(chatId, messageId, text, buttons = []) {
    try {
        const data = { chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" };
        if (buttons.length) data.reply_markup = { inline_keyboard: buttons };
        await axios.post(`${API_URL}/editMessageText`, data);
    } catch (error) {
        console.error("⚠️ خطا در ویرایش پیام:", error.message);
    }
}

// پردازش پیام‌ها
async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (!users[chatId]) {
        users[chatId] = { joinedAt: Date.now(), waiting_for_feedback: false };
        saveUsers();
    }

    // بررسی بازخورد
    if (users[chatId].waiting_for_feedback) {
        users[chatId].waiting_for_feedback = false;
        saveUsers();

        await sendMessage(ADMIN_ID, `📩 **بازخورد جدید:**\n👤 **کاربر:** [${msg.from.first_name}](tg://user?id=${chatId})\n🆔 **آیدی عددی:** \`${chatId}\`\n💬 **متن:** ${text}`);
        return sendMessage(chatId, "✅ بازخورد شما دریافت شد. متشکریم!");
    }

    if (text === "/start") {
        return sendMessage(chatId, 'سلام! 👋\nکد رهگیری تیپاکس را ارسال کنید.', [
            [{ text: "ℹ️ راهنما", callback_data: "help" }],
            [{ text: "📨 ارسال بازخورد", callback_data: "send_feedback" }]
        ]);
    }

    if (!/^\d{21}$/.test(text)) {
        return sendMessage(chatId, "🚨 **کد رهگیری نامعتبر است!**\nکد رهگیری باید **۲۱ رقم** باشد.");
    }

    return trackPackage(chatId, text);
}

// پردازش دکمه‌های اینلاین
async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data === "help") {
        return editMessage(chatId, messageId, `
📌 **راهنمای استفاده از ربات:**
1️⃣ **کد رهگیری تیپاکس** خود را ارسال کنید.
2️⃣ اطلاعات مرسوله برای شما نمایش داده می‌شود. 📦
        `, [
            [{ text: "🔙 بازگشت به منو اصلی", callback_data: "main_menu" }]
        ]);
    }

    if (data === "send_feedback") {
        users[chatId].waiting_for_feedback = true;
        saveUsers();
        return sendMessage(chatId, "📨 لطفاً بازخورد خود را ارسال کنید:");
    }

    if (data === "main_menu") {
        return editMessage(chatId, messageId, "🏠 **بازگشت به منوی اصلی**", [
            [{ text: "ℹ️ راهنما", callback_data: "help" }],
            [{ text: "📨 ارسال بازخورد", callback_data: "send_feedback" }]
        ]);
    }
}

// رهگیری مرسوله
async function trackPackage(chatId, trackingCode) {
    const pleaseWait = await sendMessage(chatId, "⏳ **در حال بررسی...**");

    try {
        const response = await axios.get(`${TIPAX_API}${trackingCode}`);
        if (!response.data.status) {
            return editMessage(chatId, pleaseWait.message_id, "🚨 **کد رهگیری یافت نشد. لطفاً دوباره تلاش کنید.**");
        }

        const packageInfo = response.data.results;
        const statusInfo = packageInfo.status_info
            .map(status => `📅 ${status.date} - **${status.status}**`)
            .join("\n");

        const lastUpdate = packageInfo.status_info.length > 0 
            ? packageInfo.status_info[packageInfo.status_info.length - 1].date 
            : "نامشخص";

        const message = `
📦 **اطلاعات مرسوله:**
**فرستنده:** ${packageInfo.sender.name}
**گیرنده:** ${packageInfo.receiver.name}
⚖️ وزن: ${packageInfo.weight} کیلوگرم
💰 هزینه: ${packageInfo.total_cost} ریال
📝 **وضعیت مرسوله:**
${statusInfo}

🕒 **آخرین بروزرسانی:** ${lastUpdate}
        `;

        return editMessage(chatId, pleaseWait.message_id, message, [
            [{ text: "🔙 بازگشت به منو اصلی", callback_data: "main_menu" }]
        ]);
    } catch (error) {
        console.error("⚠️ خطا در دریافت اطلاعات تیپاکس:", error.message);
        return editMessage(chatId, pleaseWait.message_id, "❌ **خطا در دریافت اطلاعات. لطفاً بعداً تلاش کنید.**");
    }
}

// دریافت پیام‌ها
async function getUpdates(offset) {
    try {
        const res = await axios.get(`${API_URL}/getUpdates`, { params: { offset } });
        const updates = res.data.result || [];

        for (const update of updates) {
            offset = update.update_id + 1;
            if (update.message) await handleMessage(update.message);
            else if (update.callback_query) await handleCallbackQuery(update.callback_query);
        }

        setTimeout(() => getUpdates(offset), 1000);
    } catch (error) {
        console.error("⚠️ خطا در دریافت پیام‌ها:", error.message);
        setTimeout(() => getUpdates(offset), 5000);
    }
}

// اجرای ربات
getUpdates(0);
