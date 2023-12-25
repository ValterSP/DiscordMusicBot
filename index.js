const {Client, GatewayIntentBits} = require('discord.js');
const ytdl = require('ytdl-core');
const { prefix, token } = require('./config.json'); // Certifique-se de criar um arquivo config.json com seu token e prefixo
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});
const YouTubeSearch = require('youtube-search');
const { EmbedBuilder } = require('discord.js');
const config = require('./config.json');
const youtubeAPIKey = config.youtubeAPIKey;
const queue = [];
let player
let currentConnection
let currentMessage
let youtubeSearchOptions = {
  maxResults: 1,
  key: youtubeAPIKey,
}

client.once('ready', () => {
  console.log('Bot de música está online!');
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(prefix) || message.author.bot) {
    return;
  }
  
  const args = message.content.slice(prefix.length).split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    execute(message);
  } else if (command === 'skip') {
    skip(message);
  } else if (command === 'stop') {
    stop(message);
  }
});
function enqueue(song){
  queue.push(song)
}

function createPlayer(){
  if(!player){
    player = createAudioPlayer();
    player.on(AudioPlayerStatus.Idle, async() => {
      await playNextSong(currentConnection, searchQuery)
      player.events.on('connection', (queue) => {
        queue.dispatcher.voiceConnection.on('stateChange', (oldState, newState) => {
          const oldNetworking = Reflect.get(oldState, 'networking');
          const newNetworking = Reflect.get(newState, 'networking');
      
          const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
            const newUdp = Reflect.get(newNetworkState, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
          }
      
          oldNetworking?.off('stateChange', networkStateChangeHandler);
          newNetworking?.on('stateChange', networkStateChangeHandler);
        });
      });
    })
  }
}

function dequeue(){
  return queue.shift()
}
async function execute(message) {
  const searchQuery = message.content.replace("!play ", '');

  const voiceChannel = message.member.voice.channel;

    if (!voiceChannel)
      return message.channel.send(
        'Você precisa estar em um canal de voz para tocar música!'
  );

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });
  currentConnection = connection; 
  currentMessage = message; 
  if (connection.state.status === VoiceConnectionStatus.Ready) {
    enqueue({ searchQuery, message });
    createPlayer();
    return message.channel.send('**✅ Song added to Queue!**');
  }
  
  const listener = async (oldState, newState) => {
    if (newState.member.user.bot) {
      return;
    }

    if (oldState.channel && !newState.channel) {
      const membersInChannel = oldState.channel.members.size;
      if (membersInChannel === 1) {
        message.client.removeListener('voiceStateUpdate', listener);

        if (!connection.destroyed) {
          connection.destroy();
        }
      }
    }
  };

  message.client.on('voiceStateUpdate', listener);

  await playSong(connection, searchQuery, message);

  

  async function playNextSong(connection, message){
    if(queue.length > 0){
      const nextSong = dequeue()
      await playSong(connection, nextSong.searchQuery, nextSong.message)
    }
    else{
      if(!connection.destroyed){
        connection.destroy()
      }
      message.channel.send('A lista de sons ta vazia vou bazar')
    }
  }
  
}

async function playSong(connection, searchQuery, message){

  createPlayer(); 

  player.pause();

  let searchResult;
  try {
    searchResult = await YouTubeSearch(searchQuery, youtubeSearchOptions);
  } catch (error) {
    console.error(error);
    return message.channel.send('❌ There was an error searching for the song.');
  }

  if (!searchResult || !searchResult.results.length) {
    return message.channel.send('❌ No search results found for the provided query.');
  }

  const video = searchResult.results[0];
  const youtubeLink = `https://www.youtube.com/watch?v=${video.id}`;

  const stream = ytdl(youtubeLink, { filter: 'audioonly' });
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  player.play(resource);
  connection.subscribe(player);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    await entersState(player, AudioPlayerStatus.Playing, 20_000);
    message.channel.send("A tocar agora **" + video.title + "**");
  } catch (error) {
    console.error(error);
    if (!connection.destroyed) {
      connection.destroy();
    }
    message.channel.send('🔴 There was an error playing the music.');
  }
}

async function skip(message) {
  const voiceChannel = message.member.voice.channel;
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });
  if (connection.state.status === VoiceConnectionStatus.Ready) {
    if (queue.length > 0) {
      const nextSong = dequeue();
      await playSong(connection, nextSong.searchQuery, nextSong.message);
    } else {
      return message.channel.send("**Sem merdas na fila**");;
    }
  } else {
    return message.channel.send("**Sem merdas na fila**");;
  }
}


client.login(token);