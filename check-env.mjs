import 'dotenv/config';

const url = process.env.DATABASE_URL;
console.log('Length:', url?.length);
console.log('Raw:', JSON.stringify(url));

// Show char codes for anything non-ASCII
[...url].forEach((char, i) => {
  const code = char.charCodeAt(0);
  if (code > 127) {
    console.log(`Non-ASCII char at position ${i}: "${char}" (code ${code})`);
  }
});
