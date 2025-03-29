const { Client, Events, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// نظام التذاكر
const ticketSystem = {
  activeCategory: '[ 🔖 ]  𝐎𝐏𝐄𝐍 𝗧𝗜𝗖𝗞𝗘𝗧𝗦',
  closedCategory: '[ 🔖 ]  𝗖𝗟𝗢𝗦𝗘𝗗 𝗧𝗜𝗖𝗞𝗘𝗧𝗦',
  allowedRoleIds: config.ALLOWED_ROLE_IDS || [],
  logChannelId: config.LOG_CHANNEL_ID,
  ticketCounter: 1
};

// استرجاع آخر رقم تذكرة
if (fs.existsSync('./ticketData.json')) {
  const data = JSON.parse(fs.readFileSync('./ticketData.json'));
  ticketSystem.ticketCounter = data.counter || 1;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// مكونات واجهة المستخدم
const createTicketButton = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('create_ticket')
    .setLabel('فتح تذكرة جديدة')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🎫')
);

const ticketModal = new ModalBuilder()
  .setCustomId('ticket_modal')
  .setTitle('فتح تذكرة جديدة');

const subjectInput = new TextInputBuilder()
  .setCustomId('ticket_subject')
  .setLabel("موضوع التذكرة")
  .setStyle(TextInputStyle.Short)
  .setRequired(true);

const detailsInput = new TextInputBuilder()
  .setCustomId('ticket_details')
  .setLabel("تفاصيل التذكرة")
  .setStyle(TextInputStyle.Paragraph)
  .setRequired(true);

ticketModal.addComponents(
  new ActionRowBuilder().addComponents(subjectInput),
  new ActionRowBuilder().addComponents(detailsInput)
);

// الدوال المساعدة
async function getOrCreateCategory(guild, name) {
  return guild.channels.cache.find(c => c.name === name && c.type === 4) || 
    await guild.channels.create({ 
      name, 
      type: 4,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ['ViewChannel']
        },
        ...ticketSystem.allowedRoleIds.map(roleId => ({
          id: roleId,
          allow: ['ViewChannel', 'ManageChannels']
        }))
      ]
    });
}

async function createTicket(interaction, subject, details) {
  const ticketNumber = ticketSystem.ticketCounter++;
  fs.writeFileSync('./ticketData.json', JSON.stringify({ counter: ticketSystem.ticketCounter }));

  const activeCategory = await getOrCreateCategory(interaction.guild, ticketSystem.activeCategory);
  
  const ticketChannel = await interaction.guild.channels.create({
    name: `ticket-${ticketNumber}`,
    parent: activeCategory.id,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      ...ticketSystem.allowedRoleIds.map(roleId => ({
        id: roleId,
        allow: ['ViewChannel', 'ManageMessages', 'ManageChannels']
      }))
    ]
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 التذكرة #${ticketNumber}`)
    .setDescription(`**الموضوع:**\n${subject}\n\n**التفاصيل:**\n${details}`)
    .addFields(
      { name: '👤 مقدم الطلب', value: interaction.user.toString(), inline: true },
      { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
      { name: '🔄 الحالة', value: '```diff\n+ مفتوحة\n```', inline: true }
    )
    .setColor('#5865F2')
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: 'Dev By : Quick Store', iconURL: client.user.displayAvatarURL() });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_${interaction.user.id}`)
      .setLabel('إغلاق التذكرة')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  await ticketChannel.send({
    content: `${interaction.user} ${ticketSystem.allowedRoleIds.map(r => `<@&${r}>`).join(' ')}`,
    embeds: [embed],
    components: [buttons]
  });

  await interaction.reply({
    content: `تم إنشاء تذكرتك: ${ticketChannel}`,
    flags: 'Ephemeral',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticketChannel.id}`)
          .setLabel('الذهاب للتذكرة')
          .setStyle(ButtonStyle.Link)
      )
    ]
  });
}

async function handleTicketClose(interaction) {
  const isStaff = interaction.member.roles.cache.some(r => 
    ticketSystem.allowedRoleIds.includes(r.id)
  );
  
  const userId = interaction.customId.split('_')[1];
  const isTicketOwner = interaction.user.id === userId;

  if (!isStaff && !isTicketOwner) {
    return interaction.reply({
      content: '❌ ليس لديك صلاحية إغلاق هذه التذكرة!',
      flags: 'Ephemeral'
    });
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('تأكيد إغلاق التذكرة')
    .setDescription(`**هل أنت متأكد من إغلاق التذكرة #${interaction.channel.name.replace('ticket-', '')}؟**`)
    .setColor('#ED4245')
    .setFooter({ text: 'سيتم نقل التذكرة إلى الأرشيف' });

  const confirmButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_close')
      .setLabel('تأكيد الإغلاق')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('cancel_close')
      .setLabel('إلغاء')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmButtons],
    flags: 'Ephemeral'
  });

  try {
    const confirmation = await interaction.channel.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id && ['confirm_close', 'cancel_close'].includes(i.customId),
      time: 60000
    });

    if (confirmation.customId === 'confirm_close') {
      const closedCategory = await getOrCreateCategory(interaction.guild, ticketSystem.closedCategory);
      
      await interaction.channel.setParent(closedCategory.id);
      await interaction.channel.setName(`closed-${interaction.channel.name.replace('ticket-', '')}`);
      
      await interaction.channel.permissionOverwrites.set([
        { id: interaction.guild.id, deny: ['ViewChannel'] },
        { id: userId, deny: ['SendMessages'] },
        ...ticketSystem.allowedRoleIds.map(roleId => ({
          id: roleId,
          allow: ['ViewChannel', 'ReadMessageHistory']
        }))
      ]);

      const closedEmbed = new EmbedBuilder()
        .setTitle(`📌 تم إغلاق التذكرة #${interaction.channel.name.replace('closed-', '')}`)
        .setDescription('تم نقل التذكرة إلى الأرشيف\nيمكن للمشرفين الوصول إليها عند الحاجة')
        .setColor('#57F287')
        .setFooter({ text: 'Dev By : Quick Store', iconURL: client.user.displayAvatarURL() });

      await interaction.channel.send({ embeds: [closedEmbed] });
      
      if (ticketSystem.logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(ticketSystem.logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('سجل التذاكر المغلقة')
            .setDescription(`تم إغلاق تذكرة #${interaction.channel.name.replace('closed-', '')}`)
            .addFields(
              { name: 'الموضوع', value: interaction.channel.topic || 'بدون موضوع', inline: true },
              { name: 'المستخدم', value: `<@${userId}>`, inline: true },
              { name: 'المشرف', value: interaction.user.toString(), inline: true },
              { name: 'مدة التذكرة', value: calculateDuration(interaction.channel.createdAt), inline: true }
            )
            .setColor('#FEE75C')
            .setTimestamp();
          
          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      await confirmation.update({ 
        content: '✅ تم إغلاق التذكرة بنجاح', 
        components: [], 
        embeds: [] 
      });
    } else {
      await confirmation.update({ 
        content: 'تم إلغاء عملية الإغلاق', 
        components: [], 
        embeds: [] 
      });
    }
  } catch (error) {
    console.error('Error handling ticket close:', error);
    await interaction.editReply({ 
      content: 'انتهت مهلة تأكيد الإغلاق', 
      components: [], 
      embeds: [] 
    });
  }
}

function calculateDuration(createdAt) {
  const now = new Date();
  const diff = now - createdAt;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${days} أيام ${hours} ساعات ${minutes} دقائق`;
}

// أحداث البوت
client.once(Events.ClientReady, async () => {
  console.log(`✅ البوت يعمل باسم: ${client.user.tag}`);
  
  const guild = client.guilds.cache.first();
  await getOrCreateCategory(guild, ticketSystem.activeCategory);
  await getOrCreateCategory(guild, ticketSystem.closedCategory);
  
  client.user.setActivity('Dev By : Quick Store', { type: 'WATCHING' });
});

client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith(config.PREFIX) || message.author.bot) return;
  
  const args = message.content.slice(config.PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'q8f25') {
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      return message.reply('⚠️ تحتاج إلى صلاحيات الأدمن لاستخدام هذا الأمر!');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 تذكرة المتجر')
      .setDescription('**تنتمنى منك ياجرتيني الالتزام في الاستبيان**\n\n' +
        'الرد على التذكرة سيتم من قبل المسؤولين في أسرع وقت\n' +
        'سيتم الرد على التذكرة خلال مدة زمنية لا تقل عن 20 دقيقة')
      .addFields(
        { name: '📌 التعليمات', value: 'يرجى مراجعة القوانين لتجنب الإغلاق', inline: false },
        { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
      )
      .setColor('#FF69B4')
      .setImage('https://i.imgur.com/ValentineImage.jpg')
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ 
        text: 'By: q8f25™ | نظام التذاكر', 
        iconURL: message.guild.iconURL() 
      });

    await message.channel.send({
      embeds: [embed],
      components: [createTicketButton]
    });
    await message.delete();
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
    await interaction.showModal(ticketModal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
    const subject = interaction.fields.getTextInputValue('ticket_subject');
    const details = interaction.fields.getTextInputValue('ticket_details');
    await createTicket(interaction, subject, details);
  }

  if (interaction.isButton() && interaction.customId.startsWith('close_')) {
    await handleTicketClose(interaction);
  }
});

client.login(config.TOKEN);