import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { db } from './firebaseConfig.js';
import { 
  collection, doc, getDoc, setDoc, addDoc, deleteDoc,
  query, orderBy, getDocs, writeBatch 
} from 'firebase/firestore';

// --- CONFIGURATION ---
const BOT_TOKEN = '7958085828:AAHbCB0ividauqLoykmvgbwBygL1R5ZmyMk'; 
const ADMIN_ID = 8296442213; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// --- DICTIONNAIRE DES LANGUES ---
const translations = {
  mg: {
    welcome: "Miarahaba",
    share_contact: "📱 Hizara laharana",
    see_answer: "👁️ Hijery ny valiny",
    next_q: "⏩ Fanontaniana manaraka",
    subscribe_btn: "✍️ Hisoratra anarana",
    end_course: "🎉 Vita ny fanontaniana rehetra! Misaotra.",
    admin_del: "🗑️ Hamafa ity",
    lang_set: "✅ Voaova ny teny.",
    admin_q_prompt: "ADMIN: Soraty ny QUESTION (laharana manaraka). (/cancel raha hiala)",
    admin_r_prompt: "Question voaray. Alefaso ny RÉPONSE (Texte, Sary, Video, PDF...).",
    admin_l_prompt: "Asiana Lien d'inscription ve? \nSoraty ny lien (oh: https://...) na soraty hoe 'tsia'.",
    saved_next: "✅ Voatahiry! \nSoraty avy hatrany ny QUESTION manaraka.",
    deleted: "✅ Voafafa.",
    all_deleted: "✅ Voafafa ny angona rehetra."
  },
  fr: {
    welcome: "Bonjour",
    share_contact: "📱 Partager contact",
    see_answer: "👁️ Voir la réponse",
    next_q: "⏩ Question suivante",
    subscribe_btn: "✍️ S'inscrire",
    end_course: "🎉 Toutes les questions sont finies ! Merci.",
    admin_del: "🗑️ Supprimer ceci",
    lang_set: "✅ Langue changée.",
    admin_q_prompt: "ADMIN: Écrivez la QUESTION. (/cancel pour quitter)",
    admin_r_prompt: "Question reçue. Envoyez la RÉPONSE (Texte, Photo, Vidéo...).",
    admin_l_prompt: "Ajouter un lien d'inscription ? \nEnvoyez le lien ou écrivez 'non'.",
    saved_next: "✅ Enregistré ! \nÉcrivez la prochaine QUESTION immédiatement.",
    deleted: "✅ Supprimé.",
    all_deleted: "✅ Tout a été supprimé."
  },
  en: {
    welcome: "Hello",
    share_contact: "📱 Share contact",
    see_answer: "👁️ See Answer",
    next_q: "⏩ Next Question",
    subscribe_btn: "✍️ Register here",
    end_course: "🎉 All questions completed! Thanks.",
    admin_del: "🗑️ Delete this",
    lang_set: "✅ Language set.",
    admin_q_prompt: "ADMIN: Write the QUESTION. (/cancel to quit)",
    admin_r_prompt: "Question received. Send the RESPONSE.",
    admin_l_prompt: "Add Registration Link? \nSend link or type 'no'.",
    saved_next: "✅ Saved! \nWrite the next QUESTION immediately.",
    deleted: "✅ Deleted.",
    all_deleted: "✅ All data deleted."
  }
};

// --- SERVER ---
app.get('/', (req, res) => { res.send('Sequential Bot Active!'); });
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

// --- HELPER: TRADUCTION ---
function t(key, lang = 'mg') {
  return translations[lang] ? (translations[lang][key] || key) : translations['mg'][key];
}

// --- FIREBASE UTILS ---
async function getUser(telegramId) {
  const docRef = doc(db, "users", telegramId.toString());
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

async function saveUser(telegramId, data) {
  await setDoc(doc(db, "users", telegramId.toString()), data, { merge: true });
}

// Maka ny fanontaniana rehetra milahatra araka ny fotoana nampidirana azy
async function getAllQuestions() {
  const q = query(collection(db, "menus"), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function deleteAllData() {
  const snapshot = await getDocs(collection(db, "menus"));
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

// --- LOGIC: MANDEFA QUESTION ---
async function sendQuestion(ctx, userId, index, lang) {
  const questions = await getAllQuestions();
  
  // Raha efa vita ny fanontaniana rehetra
  if (index >= questions.length) {
    await ctx.reply(t('end_course', lang));
    // Reset index raha tiana hiverina any am-boalohany izy amin'ny manaraka
    // await saveUser(userId, { currentIndex: 0 }); 
    return;
  }

  const currentQ = questions[index];
  
  // Tehirizina hoe aiza izy izao
  await saveUser(userId, { currentIndex: index });

  // Mandefa ny Question (Texte) + Bokotra "Hijery Valiny"
  await ctx.reply(
    `❓ ${currentQ.question}`, 
    Markup.inlineKeyboard([
      Markup.button.callback(t('see_answer', lang), `reveal_${currentQ.id}_${index}`)
    ])
  );
}

// --- BOT LOGIC ---

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const lang = user?.lang || 'mg';

  if (user && user.phone) {
    // Raha efa mpampiasa taloha, tohizana eo amin'ny index nijanony na 0
    const currentIndex = user.currentIndex || 0;
    await ctx.reply(`${t('welcome', lang)} ${user.nom}!`);
    await sendQuestion(ctx, ctx.from.id, currentIndex, lang);
  } else {
    // Safidy langue aloha
    ctx.reply("Miarahaba! Safidio ny fiteny / Choose language:", 
      Markup.inlineKeyboard([
        Markup.button.callback("🇲🇬 Malagasy", "setlang_mg"),
        Markup.button.callback("🇫🇷 Français", "setlang_fr"),
        Markup.button.callback("🇬🇧 English", "setlang_en")
      ])
    );
  }
});

bot.on('contact', async (ctx) => {
  const id = ctx.from.id;
  const existingUser = await getUser(id);
  const lang = existingUser?.lang || 'mg';

  await saveUser(id, {
    telegramId: id,
    nom: ctx.message.contact.first_name,
    phone: ctx.message.contact.phone_number,
    step: 'registered',
    lang: lang,
    currentIndex: 0 // Manomboka amin'ny voalohany
  });
  
  ctx.reply(`✅ ${t('welcome', lang)}!`, Markup.removeKeyboard());
  // Alefa avy hatrany ny question voalohany
  await sendQuestion(ctx, id, 0, lang);
});

// --- ADMIN COMMANDS ---
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const user = await getUser(ctx.from.id);
  const lang = user?.lang || 'mg';
  
  await saveUser(ctx.from.id, { step: 'admin_ask_question' });
  ctx.reply(t('admin_q_prompt', lang));
});

bot.command('delete_all', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await deleteAllData();
  ctx.reply(t('all_deleted', 'mg'));
});

bot.command('cancel', async (ctx) => {
  await saveUser(ctx.from.id, { step: 'registered' });
  ctx.reply("Annulé.");
});

// --- MESSAGES HANDLER (ADMIN INPUT) ---
bot.on('message', async (ctx) => {
  const id = ctx.from.id;
  const user = await getUser(id);
  const text = ctx.message.text;
  const lang = user?.lang || 'mg';

  if (id === ADMIN_ID && user?.step?.startsWith('admin_')) {
    
    // 1. Raisina ny Question
    if (user.step === 'admin_ask_question') {
      await saveUser(id, { step: 'admin_ask_response', tempQuestion: text });
      ctx.reply(t('admin_r_prompt', lang));
    
    // 2. Raisina ny Réponse (Media/Texte)
    } else if (user.step === 'admin_ask_response') {
      let type = 'text', content = text;
      
      if (ctx.message.photo) { type = 'photo'; content = ctx.message.photo.pop().file_id; }
      else if (ctx.message.video) { type = 'video'; content = ctx.message.video.file_id; }
      else if (ctx.message.audio) { type = 'audio'; content = ctx.message.audio.file_id; }
      else if (ctx.message.document) { type = 'document'; content = ctx.message.document.file_id; }
      else if (ctx.message.voice) { type = 'voice'; content = ctx.message.voice.file_id; }
      
      await saveUser(id, { step: 'admin_ask_link', tempType: type, tempContent: content });
      ctx.reply(t('admin_l_prompt', lang));

    // 3. Raisina ny Lien + SAVE
    } else if (user.step === 'admin_ask_link') {
      let link = null;
      if (text && text.includes('http')) link = text;

      // Manampy createdAt mba hahafantarana ny filaharana
      await addDoc(collection(db, "menus"), {
        question: user.tempQuestion, 
        type: user.tempType, 
        content: user.tempContent, 
        link: link,
        createdAt: new Date().toISOString() // Zava-dehibe amin'ny filaharana
      });

      // Miverina loop
      await saveUser(id, { step: 'admin_ask_question' });
      ctx.reply(t('saved_next', lang));
    }
  }
});

// --- ACTIONS (BUTTONS) ---
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const id = ctx.from.id;
  const user = await getUser(id);
  const lang = user?.lang || 'mg';

  // 1. Choix Langue
  if (data.startsWith('setlang_')) {
    const newLang = data.split('_')[1];
    await saveUser(id, { lang: newLang });
    ctx.reply(t('lang_set', newLang));
    
    if (!user || !user.phone) {
       ctx.reply(t('share_contact', newLang), Markup.keyboard([Markup.button.contactRequest(t('share_contact', newLang))]).resize().oneTime());
    } else {
       // Raha efa misy dia alefa ny question farany nijanona
       const idx = user.currentIndex || 0;
       await sendQuestion(ctx, id, idx, newLang);
    }
  }

  // 2. Asehoy ny Valiny (REVEAL)
  else if (data.startsWith('reveal_')) {
    const [_, itemId, idxStr] = data.split('_');
    const index = parseInt(idxStr);
    
    const docSnap = await getDoc(doc(db, "menus", itemId));
    if (docSnap.exists()) {
      const m = docSnap.data();
      
      // Manomana bokotra
      let buttons = [];
      
      // Bokotra Lien (raha misy)
      if (m.link) {
        buttons.push([Markup.button.url(t('subscribe_btn', lang), m.link)]);
      }
      
      // Bokotra Manaraka (Next) -> index + 1
      buttons.push([Markup.button.callback(t('next_q', lang), `next_${index + 1}`)]);
      
      // Admin Delete Button
      if (id === ADMIN_ID) {
        buttons.push([Markup.button.callback(t('admin_del', lang), `del_${itemId}`)]);
      }

      const method = m.type === 'photo' ? 'replyWithPhoto' : m.type === 'video' ? 'replyWithVideo' : m.type === 'document' ? 'replyWithDocument' : m.type === 'voice' ? 'replyWithVoice' : 'reply';
      
      // Alefa ny Réponse miaraka amin'ny bokotra "Manaraka"
      await ctx[method](m.content, Markup.inlineKeyboard(buttons));
    } else {
      ctx.reply("Error: Tsy hita ny angona.");
    }
  }

  // 3. Question Manaraka (NEXT)
  else if (data.startsWith('next_')) {
    const nextIndex = parseInt(data.split('_')[1]);
    await sendQuestion(ctx, id, nextIndex, lang);
  }

  // 4. Admin Delete
  else if (data.startsWith('del_')) {
    if (id !== ADMIN_ID) return;
    const mid = data.split('_')[1];
    await deleteDoc(doc(db, "menus", mid));
    ctx.reply(t('deleted', lang));
  }

  ctx.answerCbQuery();
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
