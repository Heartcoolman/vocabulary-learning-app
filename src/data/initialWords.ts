import { Word } from '../types/models';

/**
 * 初始词库数据 - 20个常用英语单词
 */
export const initialWords: Word[] = [
  {
    id: 'word-1',
    spelling: 'like',
    phonetic: '/laɪk/',
    meanings: ['喜欢', '像'],
    examples: ['She likes going to the zoo.', 'I like reading books.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-2',
    spelling: 'hello',
    phonetic: '/həˈloʊ/',
    meanings: ['你好', '问候'],
    examples: ['Hello, how are you?', 'She said hello to everyone.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-3',
    spelling: 'book',
    phonetic: '/bʊk/',
    meanings: ['书', '预订'],
    examples: ['I am reading a book.', 'This is an interesting book.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-4',
    spelling: 'happy',
    phonetic: '/ˈhæpi/',
    meanings: ['快乐的', '幸福的'],
    examples: ['I am very happy today.', 'She looks happy.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-5',
    spelling: 'water',
    phonetic: '/ˈwɔːtər/',
    meanings: ['水', '浇水'],
    examples: ['I need a glass of water.', 'Water the plants every day.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-6',
    spelling: 'friend',
    phonetic: '/frend/',
    meanings: ['朋友'],
    examples: ['He is my best friend.', 'I met a new friend today.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-7',
    spelling: 'school',
    phonetic: '/skuːl/',
    meanings: ['学校'],
    examples: ['I go to school every day.', 'Our school is very big.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-8',
    spelling: 'beautiful',
    phonetic: '/ˈbjuːtɪfl/',
    meanings: ['美丽的', '漂亮的'],
    examples: ['What a beautiful day!', 'She is a beautiful girl.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-9',
    spelling: 'family',
    phonetic: '/ˈfæməli/',
    meanings: ['家庭', '家人'],
    examples: ['I love my family.', 'Family is very important.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-10',
    spelling: 'time',
    phonetic: '/taɪm/',
    meanings: ['时间', '次数'],
    examples: ['What time is it?', 'Time flies so fast.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-11',
    spelling: 'good',
    phonetic: '/ɡʊd/',
    meanings: ['好的', '良好的'],
    examples: ['Good morning!', 'This is a good idea.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-12',
    spelling: 'food',
    phonetic: '/fuːd/',
    meanings: ['食物'],
    examples: ['I like Chinese food.', 'This food is delicious.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-13',
    spelling: 'home',
    phonetic: '/hoʊm/',
    meanings: ['家', '家乡'],
    examples: ['I am going home.', 'Home sweet home.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-14',
    spelling: 'love',
    phonetic: '/lʌv/',
    meanings: ['爱', '喜爱'],
    examples: ['I love you.', 'Love makes the world beautiful.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-15',
    spelling: 'work',
    phonetic: '/wɜːrk/',
    meanings: ['工作', '劳动'],
    examples: ['I work in an office.', 'Hard work pays off.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-16',
    spelling: 'study',
    phonetic: '/ˈstʌdi/',
    meanings: ['学习', '研究'],
    examples: ['I study English every day.', 'Study hard and you will succeed.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-17',
    spelling: 'music',
    phonetic: '/ˈmjuːzɪk/',
    meanings: ['音乐'],
    examples: ['I like listening to music.', 'Music makes me relax.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-18',
    spelling: 'dream',
    phonetic: '/driːm/',
    meanings: ['梦想', '做梦'],
    examples: ['Follow your dreams.', 'I had a strange dream last night.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-19',
    spelling: 'world',
    phonetic: '/wɜːrld/',
    meanings: ['世界'],
    examples: ['The world is so big.', 'I want to travel around the world.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'word-20',
    spelling: 'learn',
    phonetic: '/lɜːrn/',
    meanings: ['学习', '学会'],
    examples: ['I want to learn English.', 'We learn something new every day.'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

/**
 * 初始化词库
 * 将初始单词导入到存储中
 */
export async function initializeVocabulary(storageService: any): Promise<void> {
  try {
    // 检查是否已有单词
    const existingWords = await storageService.getWords();
    
    if (existingWords.length === 0) {
      // 导入初始单词
      for (const word of initialWords) {
        await storageService.addWord(word);
      }
      console.log('初始词库已导入');
    }
  } catch (error) {
    console.error('初始化词库失败:', error);
  }
}
