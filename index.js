require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');

const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

app.get('/', (req, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Keep-alive webserver attivo sulla porta ${PORT}`));

const CHANNEL_LIMITS = {
  lounge: 0,
  duo: 2,
  trio: 3,
  quad: 4,
  group: 5,
};

const letterMap = {
  'ɩ': 'l',
  'σ': 'o',
  'υ': 'u',
  'ᥒ': 'n',
  'ɡ': 'g',
  'ᥱ': 'e',
  'ɗ': 'd',
  'τ': 't',
  'ɾ': 'r',
  'ι': 'i',
  'α': 'a',
  'ρ': 'p',
};

function normalizeName(str) {
  const normalized = str
    .toLowerCase()
    .split('')
    .map(ch => letterMap[ch] || ch)
    .join('')
    .replace(/[^a-z0-9]/g, '');

  console.log(`Normalizing "${str}" => "${normalized}"`);
  return normalized;
}

function extractBaseName(name) {
  const base = name.split('-')[0];
  return normalizeName(base);
}

function isTriggerChannel(name) {
  const baseName = extractBaseName(name);
  return Object.keys(CHANNEL_LIMITS).includes(baseName);
}

async function createTempChannel(channel, member, match) {
  try {
    const tempChannel = await channel.guild.channels.create({
      name: `${match}-${member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: channel.parentId,
      userLimit: CHANNEL_LIMITS[match],
      permissionOverwrites: [
        {
          id: member.id,
          allow: [PermissionsBitField.Flags.Connect],
        },
      ],
    });

    await member.voice.setChannel(tempChannel);
    console.log(`🔊 Creato canale temporaneo ${tempChannel.name} per ${member.user.tag}`);
  } catch (err) {
    console.error("Errore nel muovere l'utente o creare canale:", err);
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot connesso come ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  console.log('--- voiceStateUpdate ---');

  if (oldState.channel) {
    console.log(`Utente ${oldState.member.user.tag} ha lasciato il canale: "${oldState.channel.name}"`);

    const oldBaseName = extractBaseName(oldState.channel.name);
    const isTrigger = isTriggerChannel(oldState.channel.name);
    const isTempChannel = oldState.channel.name.includes('-');

    console.log(`Controllo eliminazione canale "${oldState.channel.name}" (base: "${oldBaseName}"), membri: ${oldState.channel.members.size}, trigger originale? ${isTrigger}, temporaneo? ${isTempChannel}`);

    if (
      Object.keys(CHANNEL_LIMITS).includes(oldBaseName) &&
      isTempChannel
    ) {
      setTimeout(async () => {
        if (oldState.channel.members.size === 0) {
          const botMember = oldState.guild.members.me;
          const permissions = oldState.channel.permissionsFor(botMember);

          if (!permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            console.warn('⚠️ Il bot non ha i permessi per gestire il canale:', oldState.channel.name);
            return;
          }

          if (!oldState.channel.deletable) {
            console.warn('⚠️ Il canale non è eliminabile:', oldState.channel.name);
            return;
          }

          try {
            await oldState.channel.delete();
            console.log(`❌ Canale temporaneo "${oldState.channel.name}" eliminato perché vuoto (dopo attesa).`);
          } catch (err) {
            console.error('Errore eliminando canale temporaneo:', err);
          }
        } else {
          console.log(`⏳ Il canale "${oldState.channel.name}" non è più vuoto dopo il delay.`);
        }
      }, 2000);
    }
  }

  if (!newState.channel || newState.channel.type !== ChannelType.GuildVoice) {
    console.log('Nuovo stato canale non valido o non vocale.');
    return;
  }

  const newChannelName = newState.channel.name;

  // NON triggerare se è canale temporaneo (nome contiene '-')
  if (newChannelName.includes('-')) {
    console.log(`Il canale "${newChannelName}" è un canale temporaneo, quindi non triggera la creazione.`);
    return;
  }

  if (!isTriggerChannel(newChannelName)) {
    console.log(`Il canale "${newChannelName}" non è un canale trigger originale.`);
    return;
  }

  const match = extractBaseName(newChannelName);
  console.log(`Match trovato: "${match}" nel canale "${newChannelName}"`);

  const existing = newState.channel.guild.channels.cache.find(c =>
    c.type === ChannelType.GuildVoice &&
    c.parentId === newState.channel.parentId &&
    c.name === `${match}-${newState.member.user.username}`
  );

  if (existing) {
    console.log(`Canale temporaneo già esistente: ${existing.name} per utente ${newState.member.user.tag}`);
    return;
  }

  const botMember = newState.channel.guild.members.me;
  const permissions = newState.channel.permissionsFor(botMember);
  if (!permissions.has(PermissionsBitField.Flags.ManageChannels) ||
      !permissions.has(PermissionsBitField.Flags.MoveMembers) ||
      !permissions.has(PermissionsBitField.Flags.Connect)) {
    console.error('❌ Il bot non ha i permessi necessari (ManageChannels, MoveMembers, Connect) in questo canale.');
    return;
  }

  await createTempChannel(newState.channel, newState.member, match);
});

client.login(process.env.TOKEN);
