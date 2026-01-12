import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { db } from './firebaseConfig.js';
import { 
  collection, doc, getDoc, setDoc, addDoc, deleteDoc,
  query, where, getDocs, writeBatch 
} from 'firebase/firestore';

// --- CONFIGURATION ---
const BOT_TOKEN = '7958085828:AAHbCB0ividauqLoykmvgbwBygL1R5ZmyMk'; 
const ADMIN_ID = 8296442213; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// --- DICTIONNAIRE DES LANGUES (TRADUCTION) ---
const translations = {
  mg: {
    welcome: "Miarahaba",
    share_contact: "📱 Hizara laharana",
    registered: "Voasoratra soa aman-tsara! Ireto ny safidy:",
    back: "🔙 Miverina",
    next: "➡️",
    prev: "⬅️",
    subscribe_btn: "✍️ Hisoratra anarana",
    admin_add_sub: "➕ Hanampy Sous-menu",
    admin_del: "🗑️ Hamafa ity",
    choose_lang: "Safidio ny teny (Langue):",
    lang_set: "✅ Voaova ny teny.",
    admin_q_prompt: "ADMIN: Soraty ny QUESTION (na lohateny). (/cancel raha hiala)",
    admin_r_prompt: "Question voaray. Alefaso ny RÉPONSE (Texte, Sary, Video, PDF, Audio...).",
    admin_l_prompt: "Tianao asiana Lien d'inscription ve? \nSoraty ny lien (oh: https://...) na soraty hoe 'tsia' raha tsy asiana.",
    saved_next: "✅ Voatahiry! \nSoraty avy hatrany ny QUESTION manaraka (na /cancel raha vita).",
    deleted: "✅ Voafafa.",
    all_deleted: "✅ Voafafa ny menus rehetra."
  },
  fr: {
    welcome: "Bonjour",
    share_contact: "📱 Partager contact",
    registered: "Bien enregistré ! Voici les options :",
    back: "🔙 Retour",
    next: "➡️",
    prev: "⬅️",
    subscribe_btn: "✍️ S'inscrire",
    admin_add_sub: "➕ Ajouter Sous-menu",
    admin_del: "🗑️ Supprimer ceci",
    choose_lang: "Choisissez votre langue :",
    lang_set: "✅ Langue changée.",
    admin_q_prompt: "ADMIN: Écrivez la QUESTION (ou titre). (/cancel pour quitter)",
    admin_r_prompt: "Question reçue. Envoyez la RÉPONSE (Texte, Photo, Vidéo, PDF...).",
    admin_l_prompt: "Voulez-vous ajouter un lien d'inscription ? \nEnvoyez le lien (ex: https://...) ou écrivez 'non' pour ignorer.",
    saved_next: "✅ Enregistré ! \nÉcrivez immédiatement la prochaine QUESTION (ou /cancel pour finir).",
    deleted: "✅ Supprimé.",
    all_deleted: "✅ Tous les menus ont été supprimés."
  },
  en: {
    welcome: "Hello",
    share_contact: "📱 Share contact",
    registered: "Registered successfully! Here are the options:",
    back: "🔙 Back",
    next: "➡️",
    prev: "⬅️",
    subscribe_btn: "✍️ Register here",
    admin_add_sub: "➕ Add Sub-menu",
    admin_del: "🗑️ Delete this",
    choose_lang: "Choose your language:",
    lang_set: "✅ Language set.",
    admin_q_prompt: "ADMIN: Write the QUESTION (or title). (/cancel to quit)",
    admin_r_prompt: "Question received. Send the RESPONSE (Text, Photo, Video, PDF...).",
    admin_l_prompt: "Do you want to add a Registration Link? \nSend the link (e.g., https://...) or type 'no' to skip.",
    saved_next: "✅ Saved! \nWrite the next QUESTION immediately (or /cancel to finish).",
    deleted: "✅ Deleted.",
    all_deleted: "✅ All menus deleted."
  }
};

// --- SERVER (Ho an'ny Render) ---
app.get('/', (req, res) => { res.send('Bot is active v2.0!'); });
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

// --- HELPER FUNCTION: GET TEXT BY LANG ---
function t(key, lang = 'mg') {
  return translations[lang] ? (translations[lang][key] || key) : translations['mg'][key];
}

// --- FONCTIONS FIREBASE ---
async function getUser(telegramId) {
  const docRef = doc(db, "users", telegramId.toString());
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

async function saveUser(telegramId, data) {
  await setDoc(doc(db, "users", telegramId.toString()), data, { merge: true });
}

async function deleteAllMenus() {
  const q = query(collection(db, "menus"));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

async function getMenuKeyboard(parentId = '0', page = 0, lang = 'mg') {
  const itemsPerPage = 5;
  const q = query(collection(db, "menus"), where("parentId", "==", parentId.toString()));
  const snapshot = await getDocs(q);
  
  let menus = [];
  snapshot.forEach(doc => { menus.push({ id: doc.id, ...doc.data() }); });

  const totalPages = Math.ceil(menus.length / itemsPerPage);
  const start = page * itemsPerPage;
  const currentMenus = menus.slice(start, start + itemsPerPage);

  // Bokotra Questions
  const buttons = currentMenus.map(m => [Markup.button.callback(m.question, `view_${m.id}`)]);
  
  // Navigation (Suivant/Précédent)
  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback(t('prev', lang), `page_${parentId}_${page - 1}`));
  if (page < totalPages - 1) navButtons.push(Markup.button.callback(t('next', lang), `page_${parentId}_${page + 1}`));
  if (navButtons.length > 0) buttons.push(navButtons);

  // Bokotra Retour (raha tsy menu principal)
  if (parentId !== '0') {
    const parentDoc = await getDoc(doc(db, "menus", parentId));
    const grandParentId = parentDoc.exists() ? parentDoc.data().parentId : '0';
    buttons.push([Markup.button.callback(t('back', lang), `page_${grandParentId}_0`)]);
  }
  return Markup.inlineKeyboard(buttons);
}

// --- LOGIC BOT ---

// 1. Commande Start sy Choix Langue
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  // Default langue 'mg' raha vao miditra voalohany
  const lang = user?.lang || 'mg';
  
  if (user && user.phone) {
    ctx.reply(`${t('welcome', lang)} ${user.nom}!`, await getMenuKeyboard('0', 0, lang));
  } else {
    // Raha vao sambany dia mangataka langue aloha na contact avy hatrany
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
  // Raha tsy mbola nisafidy langue dia MG par défaut
  const existingUser = await getUser(ctx.from.id);
  const lang = existingUser?.lang || 'mg';

  await saveUser(ctx.from.id, {
    telegramId: ctx.from.id,
    nom: ctx.message.contact.first_name,
    phone: ctx.message.contact.phone_number,
    step: 'registered',
    lang: lang
  });
  ctx.reply(t('registered', lang), await getMenuKeyboard('0', 0, lang));
});

// 2. Gestion Admin
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const user = await getUser(ctx.from.id);
  const lang = user?.lang || 'mg';
  
  await saveUser(ctx.from.id, { step: 'admin_ask_question', tempParent: '0' });
  ctx.reply(t('admin_q_prompt', lang));
});

bot.command('delete_all', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await deleteAllMenus();
  ctx.reply(t('all_deleted', 'mg')); // Valiny amin'ny teny Malagasy foana ho an'ny admin
});

bot.command('cancel', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const lang = user?.lang || 'mg';
  await saveUser(ctx.from.id, { step: 'registered' });
  ctx.reply("Annulé.", await getMenuKeyboard('0', 0, lang));
});

// 3. Traitement Messages (Admin steps)
bot.on('message', async (ctx) => {
  const id = ctx.from.id;
  const user = await getUser(id);
  const text = ctx.message.text;
  const lang = user?.lang || 'mg';

  if (id === ADMIN_ID && user?.step?.startsWith('admin_')) {
    
    // Etape 1: Mandray Question
    if (user.step === 'admin_ask_question') {
      await saveUser(id, { step: 'admin_ask_response', tempQuestion: text, tempParent: user.tempParent || '0' });
      ctx.reply(t('admin_r_prompt', lang));
    
    // Etape 2: Mandray Réponse (Media/Texte)
    } else if (user.step === 'admin_ask_response') {
      let type = 'text', content = text;
      
      // Detection type
      if (ctx.message.photo) { type = 'photo'; content = ctx.message.photo.pop().file_id; }
      else if (ctx.message.video) { type = 'video'; content = ctx.message.video.file_id; }
      else if (ctx.message.audio) { type = 'audio'; content = ctx.message.audio.file_id; }
      else if (ctx.message.document) { type = 'document'; content = ctx.message.document.file_id; }
      else if (ctx.message.voice) { type = 'voice'; content = ctx.message.voice.file_id; } // Audio voice note
      
      // Tehirizina vonjimaika ary alefa any amin'ny Etape 3 (Lien)
      await saveUser(id, { 
        step: 'admin_ask_link', 
        tempType: type, 
        tempContent: content 
      });
      ctx.reply(t('admin_l_prompt', lang));

    // Etape 3: Mandray Lien (Facultatif) ary SAVE FINAL
    } else if (user.step === 'admin_ask_link') {
      let link = null;
      // Raha misy http dia raisina ho lien, raha teny hafa dia "skip"
      if (text && text.includes('http')) {
        link = text;
      }

      // 1. Tehirizina ao amin'ny base de données
      await addDoc(collection(db, "menus"), {
        question: user.tempQuestion, 
        type: user.tempType, 
        content: user.tempContent, 
        link: link, // Mety ho null raha tsy nampiditra
        parentId: user.tempParent || '0'
      });

      // 2. Miverina avy hatrany manontany Question vaovao (LOOP)
      // Tsy manova parentId mba hahafahana manohy mameno ny categorie iray
      await saveUser(id, { step: 'admin_ask_question', tempParent: user.tempParent }); 
      
      ctx.reply(t('saved_next', lang));
    }
  }
});

// 4. Gestion Actions (Boutons)
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const id = ctx.from.id;
  const user = await getUser(id);
  const lang = user?.lang || 'mg'; // Fiteny an'ilay user

  // --- CHANGEMENT LANGUE ---
  if (data.startsWith('setlang_')) {
    const newLang = data.split('_')[1];
    await saveUser(id, { lang: newLang });
    ctx.reply(t('lang_set', newLang));
    
    // Raha mbola tsy voasoratra dia anontanio contact
    if (!user || !user.phone) {
       ctx.reply(t('share_contact', newLang), Markup.keyboard([Markup.button.contactRequest(t('share_contact', newLang))]).resize().oneTime());
    } else {
       ctx.reply("Menu:", await getMenuKeyboard('0', 0, newLang));
    }
  }

  // --- NAVIGATION MENU ---
  else if (data.startsWith('page_')) {
    const [_, pid, p] = data.split('_');
    ctx.editMessageText("Menu:", await getMenuKeyboard(pid, parseInt(p), lang));
  } 
  
  // --- AFFICHER CONTENU ---
  else if (data.startsWith('view_')) {
    const mid = data.split('_')[1];
    const docSnap = await getDoc(doc(db, "menus", mid));
    
    if (docSnap.exists()) {
      const m = docSnap.data();
      
      // Manomana ny bokotra ambany (Lien + Sous-menu + Delete raha admin)
      let buttons = [];
      
      // 1. Bokotra Lien d'inscription (raha misy)
      if (m.link) {
        buttons.push([Markup.button.url(t('subscribe_btn', lang), m.link)]);
      }

      // Check raha misy sous-menu mba hitondrana azy any
      const sub = await getDocs(query(collection(db, "menus"), where("parentId", "==", mid)));
      if (!sub.empty) {
         // Raha misy sous-menu dia tsy maintsy afaka manokatra an'ireo
         // Eto dia mampiseho menu vaovao isika
      }
      
      // Asehoy ny contenu (Sary/Video/Texte...)
      const method = m.type === 'photo' ? 'replyWithPhoto' : m.type === 'video' ? 'replyWithVideo' : m.type === 'document' ? 'replyWithDocument' : m.type === 'voice' ? 'replyWithVoice' : 'reply';
      
      // Raha misy lien dia alefa miaraka amin'ny extra keyboard
      let extra = buttons.length > 0 ? Markup.inlineKeyboard(buttons) : null;
      await ctx[method](m.content, extra);

      // Raha misy sous-menus dia asehoy ny lisitra
      if (!sub.empty) {
        ctx.reply("Safidy:", await getMenuKeyboard(mid, 0, lang));
      } 
      // Raha tsy misy sous-menu fa Admin dia manolotra safidy hanampy na hamafa
      else if (id === ADMIN_ID) {
        const adminBtns = [
          Markup.button.callback(t('admin_add_sub', lang), `addsub_${mid}`),
          Markup.button.callback(t('admin_del', lang), `del_${mid}`)
        ];
        ctx.reply("Admin Options:", Markup.inlineKeyboard(adminBtns));
      }
    }
  } 
  
  // --- ADMIN: AJOUTER SOUS-MENU ---
  else if (data.startsWith('addsub_')) {
    if (id !== ADMIN_ID) return;
    await saveUser(id, { step: 'admin_ask_question', tempParent: data.split('_')[1] });
    ctx.reply(t('admin_q_prompt', lang));
  }

  // --- ADMIN: SUPPRIMER MENU ---
  else if (data.startsWith('del_')) {
    if (id !== ADMIN_ID) return;
    const mid = data.split('_')[1];
    await deleteDoc(doc(db, "menus", mid));
    ctx.reply(t('deleted', lang));
    // Mety mila miverina amin'ny menu teo aloha
    await saveUser(id, { step: 'registered' });
  }

  ctx.answerCbQuery();
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
