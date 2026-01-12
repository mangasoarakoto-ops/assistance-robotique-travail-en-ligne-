import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { db } from './firebaseConfig.js';
import { 
  collection, doc, getDoc, setDoc, addDoc, 
  query, where, getDocs 
} from 'firebase/firestore';

// --- CONFIGURATION ---
const BOT_TOKEN = '7958085828:AAHbCB0ividauqLoykmvgbwBygL1R5ZmyMk'; 
const ADMIN_ID = 8296442213; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// --- SERVER (Ho an'ny Render) ---
app.get('/', (req, res) => { res.send('Bot is active!'); });
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

// --- FONCTIONS FIREBASE ---
async function getUser(telegramId) {
  const docRef = doc(db, "users", telegramId.toString());
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

async function saveUser(telegramId, data) {
  await setDoc(doc(db, "users", telegramId.toString()), data, { merge: true });
}

async function getMenuKeyboard(parentId = '0', page = 0) {
  const itemsPerPage = 5;
  const q = query(collection(db, "menus"), where("parentId", "==", parentId.toString()));
  const snapshot = await getDocs(q);
  
  let menus = [];
  snapshot.forEach(doc => { menus.push({ id: doc.id, ...doc.data() }); });

  const totalPages = Math.ceil(menus.length / itemsPerPage);
  const start = page * itemsPerPage;
  const currentMenus = menus.slice(start, start + itemsPerPage);

  const buttons = currentMenus.map(m => [Markup.button.callback(m.question, `view_${m.id}`)]);
  
  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback("⬅️", `page_${parentId}_${page - 1}`));
  if (page < totalPages - 1) navButtons.push(Markup.button.callback("➡️", `page_${parentId}_${page + 1}`));
  if (navButtons.length > 0) buttons.push(navButtons);

  if (parentId !== '0') {
    const parentDoc = await getDoc(doc(db, "menus", parentId));
    const grandParentId = parentDoc.exists() ? parentDoc.data().parentId : '0';
    buttons.push([Markup.button.callback("🔙 Retour", `page_${grandParentId}_0`)]);
  }
  return Markup.inlineKeyboard(buttons);
}

// --- LOGIC BOT ---
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.phone) {
    ctx.reply(`Miarahaba ${user.nom}!`, await getMenuKeyboard('0'));
  } else {
    ctx.reply("Miarahaba! Tsindrio eto raha hampiasa ny bot:", Markup.keyboard([Markup.button.contactRequest('📱 Hizara laharana')]).resize().oneTime());
  }
});

bot.on('contact', async (ctx) => {
  await saveUser(ctx.from.id, {
    telegramId: ctx.from.id,
    nom: ctx.message.contact.first_name,
    phone: ctx.message.contact.phone_number,
    step: 'registered'
  });
  ctx.reply("Voasoratra soa aman-tsara! Ireto ny safidy:", await getMenuKeyboard('0'));
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await saveUser(ctx.from.id, { step: 'admin_ask_question', tempParent: '0' });
  ctx.reply("ADMIN: Soraty ny Question tianao ampidirina (/cancel raha hiala).");
});

bot.command('cancel', async (ctx) => {
  await saveUser(ctx.from.id, { step: 'registered' });
  ctx.reply("Annulé.");
});

bot.on('message', async (ctx) => {
  const id = ctx.from.id;
  const user = await getUser(id);
  const text = ctx.message.text;

  if (id === ADMIN_ID && user?.step?.startsWith('admin_')) {
    if (user.step === 'admin_ask_question') {
      await saveUser(id, { step: 'admin_ask_response', tempQuestion: text, tempParent: user.tempParent || '0' });
      ctx.reply("Question voaray. Alefaso ny REPONSE (Texte, Sary, Video...).");
    } else if (user.step === 'admin_ask_response') {
      let type = 'text', content = text;
      if (ctx.message.photo) { type = 'photo'; content = ctx.message.photo.pop().file_id; }
      else if (ctx.message.video) { type = 'video'; content = ctx.message.video.file_id; }
      else if (ctx.message.audio) { type = 'audio'; content = ctx.message.audio.file_id; }
      else if (ctx.message.document) { type = 'document'; content = ctx.message.document.file_id; }
      
      await addDoc(collection(db, "menus"), {
        question: user.tempQuestion, type, content, parentId: user.tempParent || '0'
      });
      await saveUser(id, { step: 'registered' });
      ctx.reply("✅ Menu nampidirina!");
    }
  }
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const id = ctx.from.id;

  if (data.startsWith('page_')) {
    const [_, pid, p] = data.split('_');
    ctx.editMessageText("Menu:", await getMenuKeyboard(pid, parseInt(p)));
  } else if (data.startsWith('view_')) {
    const mid = data.split('_')[1];
    const docSnap = await getDoc(doc(db, "menus", mid));
    if (docSnap.exists()) {
      const m = docSnap.data();
      const method = m.type === 'photo' ? 'replyWithPhoto' : m.type === 'video' ? 'replyWithVideo' : m.type === 'document' ? 'replyWithDocument' : 'reply';
      await ctx[method](m.content);
      
      const sub = await getDocs(query(collection(db, "menus"), where("parentId", "==", mid)));
      if (!sub.empty) ctx.reply("Safidy:", await getMenuKeyboard(mid));
      else if (id === ADMIN_ID) ctx.reply("Admin: Ajouter sous-menu?", Markup.inlineKeyboard([Markup.button.callback("➕ Oui", `addsub_${mid}`)]));
    }
  } else if (data.startsWith('addsub_')) {
    if (id !== ADMIN_ID) return;
    await saveUser(id, { step: 'admin_ask_question', tempParent: data.split('_')[1] });
    ctx.reply("Soraty ny question sous-menu:");
  }
  ctx.answerCbQuery();
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
