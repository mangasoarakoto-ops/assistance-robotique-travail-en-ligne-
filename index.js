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
    click_question: "👇 Tsindrio ity fanontaniana ity raha te hahalala ny valiny:",
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
    click_question: "👇 Cliquez sur la question pour voir la réponse :",
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
    click_question: "👇 Click the question below to see the answer:",
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
app.get('/', (req, res) => { res.send('Auto-Flow Bot Active!'); });
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

// Maka ny fanontaniana rehetra milahatra
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

// --- LOGIC: MANDEFA QUESTION (BOUTON) ---
async function sendQuestionButton(ctx, userId, index, lang) {
  const questions = await getAllQuestions();
  
  // Raha efa vita ny fanontaniana rehetra
  if (index >= questions.length) {
    await ctx.reply(t('end_course', lang));
    return;
  }

  const currentQ = questions[index];
  
  // Tehirizina ny toerana misy azy
  await saveUser(userId, { currentIndex: index });

  // Mandefa message misy Bouton ilay Question
  // Ny bouton dia misy ny soratra hoe "Question..."
  // Ny data dia misy ny ID sy ny Index
  await ctx.reply(
    t('click_question', lang), 
    Markup.inlineKeyboard([
      [Markup.button.callback(`❓ ${currentQ.question}`, `answer_${currentQ.id}_${index}`)]
    ])
  );
}

// --- BOT LOGIC ---

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const lang = user?.lang || 'mg';

  if (user && user.phone) {
    // Raha efa mpampiasa dia tohizana eo amin'ny nijanony
    const currentIndex = user.currentIndex || 0;
    await ctx.reply(`${t('welcome', lang)} ${user.nom}!`);
    await sendQuestionButton(ctx, ctx.from.id, currentIndex, lang);
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
    currentIndex: 0 
  });
  
  ctx.reply(`✅ ${t('welcome', lang)}!`, Markup.removeKeyboard());
  // Alefa avy hatrany ny BOUTON QUESTION 1
  await sendQuestionButton(ctx, id, 0, lang);
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

// --- ADMIN INPUT HANDLER ---
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
    
    // 2. Raisina ny Réponse
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

      await addDoc(collection(db, "menus"), {
        question: user.tempQuestion, 
        type: user.tempType, 
        content: user.tempContent, 
        link: link,
        createdAt: new Date().toISOString()
      });

      // Loop: Miverina manontany Question manaraka avy hatrany
      await saveUser(id, { step: 'admin_ask_question' });
      ctx.reply(t('saved_next', lang));
    }
  }
});

// --- ACTIONS (BUTTONS CLICKS) ---
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
       const idx = user.currentIndex || 0;
       await sendQuestionButton(ctx, id, idx, newLang);
    }
  }

  // 2. REHEFA MIKITIKA QUESTION (answer_)
  else if (data.startsWith('answer_')) {
    const [_, itemId, idxStr] = data.split('_');
    const index = parseInt(idxStr);
    
    const docSnap = await getDoc(doc(db, "menus", itemId));
    
    // Valiny amin'ny button click
    await ctx.answerCbQuery(); 

    if (docSnap.exists()) {
      const m = docSnap.data();
      
      // Manomana bokotra fanampiny ho an'ny valiny (Lien d'inscription raha misy)
      let responseButtons = [];
      if (m.link) {
        responseButtons.push([Markup.button.url(t('subscribe_btn', lang), m.link)]);
      }
      // Raha admin dia afaka mamafa
      if (id === ADMIN_ID) {
        responseButtons.push([Markup.button.callback(t('admin_del', lang), `del_${itemId}`)]);
      }

      const keyboard = responseButtons.length > 0 ? Markup.inlineKeyboard(responseButtons) : null;
      const method = m.type === 'photo' ? 'replyWithPhoto' : m.type === 'video' ? 'replyWithVideo' : m.type === 'document' ? 'replyWithDocument' : m.type === 'voice' ? 'replyWithVoice' : 'reply';
      
      // A. Asehoy ny valiny (Réponse)
      await ctx[method](m.content, keyboard);

      // B. AVY HATRANY: Asehoy ny Question Manaraka (Next Question Button)
      // Tsy mila mikitika "Next" intsony ny olona fa tonga dia miseho
      setTimeout(async () => {
         await sendQuestionButton(ctx, id, index + 1, lang);
      }, 1000); // Andrasana kely (1 seconde) mba tsy hiara-mipoaka be loatra
      
    } else {
      ctx.reply("Error: Tsy hita ny angona.");
    }
  }

  // 3. Admin Delete
  else if (data.startsWith('del_')) {
    if (id !== ADMIN_ID) return;
    const mid = data.split('_')[1];
    await deleteDoc(doc(db, "menus", mid));
    ctx.reply(t('deleted', lang));
  }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
