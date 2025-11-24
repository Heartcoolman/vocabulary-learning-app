import { faker } from '@faker-js/faker';
import { UserRole, WordBookType, WordState } from '@prisma/client';
import bcrypt from 'bcrypt';

export const userFactory = {
  build: (overrides?: any) => ({
    email: faker.internet.email(),
    username: faker.internet.userName(),
    passwordHash: bcrypt.hashSync('password123', 10),
    role: UserRole.USER,
    ...overrides,
  }),
};

export const wordBookFactory = {
  build: (overrides?: any) => ({
    name: faker.lorem.words(3),
    description: faker.lorem.sentence(),
    type: WordBookType.USER,
    isPublic: false,
    wordCount: 0,
    ...overrides,
  }),
};

export const wordFactory = {
  build: (overrides?: any) => ({
    spelling: faker.lorem.word(),
    phonetic: `/${faker.lorem.word()}/`,
    meanings: [faker.lorem.sentence()],
    examples: [faker.lorem.sentence()],
    ...overrides,
  }),
};

export const answerRecordFactory = {
  build: (overrides?: any) => ({
    selectedAnswer: faker.lorem.word(),
    correctAnswer: faker.lorem.word(),
    isCorrect: faker.datatype.boolean(),
    responseTime: faker.number.int({ min: 1000, max: 10000 }),
    dwellTime: faker.number.int({ min: 2000, max: 15000 }),
    ...overrides,
  }),
};

export const wordLearningStateFactory = {
  build: (overrides?: any) => ({
    state: WordState.NEW,
    masteryLevel: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    currentInterval: 1,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    ...overrides,
  }),
};
