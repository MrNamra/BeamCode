const ADJECTIVES = [
  'Brave',
  'Calm',
  'Clever',
  'Eager',
  'Gentle',
  'Happy',
  'Jolly',
  'Kind',
  'Lively',
  'Proud',
  'Quick',
  'Quiet',
  'Swift',
  'Wise',
  'Warm',
  'Witty',
  'Bright',
  'Crisp',
  'Bold',
  'Sunny',
];

const ANIMALS = [
  'Otter',
  'Fox',
  'Panda',
  'Falcon',
  'Dolphin',
  'Robin',
  'Badger',
  'Koala',
  'Cheetah',
  'Tiger',
  'Penguin',
  'Sparrow',
  'Beaver',
  'Eagle',
  'Rabbit',
  'Seal',
  'Hedgehog',
  'Owl',
  'Llama',
  'Bear',
];

export function generateDeviceName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
  return `${adj} ${animal}`;
}
