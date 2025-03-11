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

    if (text === "/admin" && chatId === ADMIN_ID) {
        return sendMessage(chatId, "🔧 **پنل مدیریت**\nلطفاً یک گزینه را انتخاب کنید:", [
            [{ text: "📊 آمار کاربران", callback_data: "show_user_count" }]
        ]);
    }

    if (text === "/start") {
        return sendMessage(chatId, '**سلام! 👋\nبرای پیگیری مرسوله تیپاکس، کد رهگیری را وارد کنید.\nبرای دریافت راهنما، دکمه راهنما را فشار دهید.**', [
            [{ text: "ℹ️ راهنما", callback_data: "help" }],
            [{ text: "📨 ارسال بازخورد", callback_data: "send_feedback" }],
            [{ text: "بازوی صراط", url: "https://ble.ir/seratbot" }],
            [{ text: "کانال ما", url: "https://ble.ir/shafag_tm" }]
        ]);
    }

    return trackPackage(chatId, text);
}

// پردازش دکمه‌های اینلاین
async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data === "show_user_count") {
        const userList = Object.keys(users).map(chatId => `Chat ID: ${chatId}`).join("\n");
        return sendMessage(chatId, userList ? `👥 **لیست کاربران:**\n\n${userList}` : "❌ هیچ کاربری ثبت نشده است.");
    }

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
        return editMessage(chatId, messageId, "**کد رهگیری خود را ارسال کنید**", [
            [{ text: "ℹ️ راهنما", callback_data: "help" }],
            [{ text: "📨 ارسال بازخورد", callback_data: "send_feedback" }],
            [{ text: "بازوی صراط", url: "https://ble.ir/seratbot" }],
            [{ text: "کانال ما", url: "https://ble.ir/shafag_tm" }]
        ]);
    }
}


// رهگیری مرسوله
// تابع رهگیری مرسوله
async function trackPackage(chatId, trackingCode) {
    // بررسی اینکه کد رهگیری ۲۱ رقمی باشد
    if (!/^\d{21}$/.test(trackingCode)) {
        return sendMessage(chatId, "❌ **کد رهگیری باید ۲۱ رقمی و عددی باشد.**");
    }

    // ارسال پیام انتظار
    const pleaseWait = await sendMessage(chatId, "⏳ **در حال بررسی...**",);

    try {
        const response = await axios.get(`${TIPAX_API}${trackingCode}`);

        // بررسی وضعیت پاسخ API
        if (response.status !== 200) {
            return editMessage(chatId, pleaseWait.message_id, "❌ **خطا در اتصال به سرور. لطفاً دوباره تلاش کنید.**");
        }

        const data = response.data;

        // بررسی معتبر بودن داده‌های دریافت‌شده
        if (!data.status || !data.results) {
            return editMessage(chatId, pleaseWait.message_id, "🔮 **اطلاعات مرسوله پیدا نشد.**");
        }

        const results = data.results;
        const sender = results.sender || {};
        const receiver = results.receiver || {};
        const statusInfo = results.status_info || [];

        // ساخت پیام خروجی
        let parcelInfo = `📦 **اطلاعات مرسوله:**\n`;
        parcelInfo += `📤 **فرستنده:** ${sender.name || "نامشخص"} از ${sender.city || "نامشخص"}\n`;
        parcelInfo += `📥 **گیرنده:** ${receiver.name || "نامشخص"} در ${receiver.city || "نامشخص"}\n`;
        parcelInfo += `🚚 **وزن:** ${results.weight || "نامشخص"} کیلوگرم\n`;
        parcelinfo += `📦 **نوع بسته:** {results.get('COD', 'نامشخص')}\n`;
        parcelInfo += `💸 **هزینه کل:** ${results.total_cost || "نامشخص"} تومان\n`;
        parcelInfo += `🔄 **وضعیت پرداخت:** ${results.pay_type || "نامشخص"}\n`;
        parcelinfo += `🌍 **مسافت:** {results.get('city_distance', 'نامشخص')} کیلومتر\n`;
        parcelinfo += `📍 **زون:** {results.get('distance_zone', 'نامشخص')}\n`;
        

        if (statusInfo.length > 0) {
            parcelInfo += `\n📝 **وضعیت مرسوله:**\n`;
            statusInfo.forEach(status => {
                parcelInfo += `📅 **تاریخ:** ${status.date || "نامشخص"}\n`;
                parcelInfo += `🔹 **وضعیت:** ${status.status || "نامشخص"}\n`;
                parcelInfo += `📍 **محل:** ${status.representation || "نامشخص"}\n\n`;
            });
        } else {
            parcelInfo += `\n🔮 **وضعیت مرسوله در دسترس نیست.**\n`;
        }

        // افزودن زمان آخرین بروزرسانی
        const lastUpdate = new Date().toLocaleString("fa-IR");
        parcelInfo += `\n🕰 **آخرین بروزرسانی:** ${lastUpdate}`;

        // ارسال اطلاعات به کاربر
        return editMessage(chatId, pleaseWait.message_id, parcelInfo, [
            [{ text: "🔙 بازگشت به منو اصلی", callback_data: "main_menu" }],
            [{ text: "ارتباط با سازنده بازو", url: "https://ble.ir/devehsan" }]
        ]);

    } catch (error) {
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
