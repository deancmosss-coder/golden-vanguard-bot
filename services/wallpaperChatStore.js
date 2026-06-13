const messages = [];

function addMessage(data) {
  messages.unshift({
    channel: data.channel,
    author: data.author,
    content: data.content,
    createdAt: Date.now(),
  });

  if (messages.length > 50) {
    messages.length = 50;
  }
}

function getRecentMessages(limit = 10) {
  return messages.slice(0, limit);
}

module.exports = {
  addMessage,
  getRecentMessages,
};
