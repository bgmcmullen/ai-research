'use strict';

require('dotenv').config();

const { createClient } = require('redis');

const intervalFile = './intervals-for-chat-gpt.pdf';

const readline = require('readline');

const fs = require('fs');

const OpenAI = require("openai");

const redisClient = createClient();

redisClient.on('error', (err: any) => console.error('Redis Client Error', err));

async function setupRedisConnection() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}
  

async function fuzzySearchKey(prompt: string) {
  await setupRedisConnection();
  prompt = prompt.toLowerCase();

  const allKeys = await redisClient.keys('prompt:*');

  for (const key of allKeys) {
    const cachedPrompt = key.split(':')[1];
    const distance = levenshteinDistance(prompt, cachedPrompt);
    if (distance < 3) {
      return key;
    }
  }

  return null;
}

function levenshteinDistance(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : i))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

// function jaccardSimilarity(str1: string, str2: string) {
//   const set1 = new Set(str1);
//   const set2 = new Set(str2);
//   const intersection = new Set([...set1].filter((x) => set2.has(x)));
//   const union = new Set([...set1, ...set2]);
//   return intersection.size / union.size;
// }

// function combinedSimilarity(str1: string, str2: string) {
//   const wordJaccard = jaccardSimilarity(str1, str2);
//   const ngramJaccard = ngramJaccardSimilarity(str1, str2);
//   return (wordJaccard + ngramJaccard) / 2;
// }

// function ngramJaccardSimilarity(str1: string, str2: string, n = 2) {
//   const ngrams = (str: string, n: number) => {
//     const ngramSet = new Set();
//     for (let i = 0; i < str.length - n + 1; i++) {
//       ngramSet.add(str.substring(i, i + n));
//     }
//     return ngramSet;
//   };

//   const set1 = ngrams(str1, n);
//   const set2 = ngrams(str2, n);
//   const intersection = new Set([...set1].filter((x) => set2.has(x)));
//   const union = new Set([...set1, ...set2]);
//   return intersection.size / union.size;
// }

// Create an instance of the OpenAI class
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {

  const filePathes: string[] = [
    "bridging-tech-files/Become_a_Tutor-BRIDGING_TECH.txt",
    "bridging-tech-files/BRIDGING_TECH-The_Bridging_Tech_Charitable_Fund_Nonprofit_for_Kids.txt",
    "bridging-tech-files/Collboration_for_Ed_Tech_The_Bridging_Tech_Charitable_Fund_Nonprofit_for_Kids-BRIDGING_TECH.txt",
    "bridging-tech-files/Contact_The_Bridging_Tech_Charitable_Fund_Nonprofit_for_Kids-BRIDGING_TECH.txt",
    "bridging-tech-files/Donor_Advised_Fund_Giving-BRIDGING_TECH.txt",
    "bridging-tech-files/Our_2024_Gala-BRIDGING_TECH.txt",
    "bridging-tech-files/Our_Donors-BRIDGING_TECH.txt",
    "bridging-tech-files/Our_News_and_Events-BRIDGING_TECH.txt",
    "bridging-tech-files/Our_Partners-The_Bridging_Tech_Charitable_Fund_Nonprofit_for_Kids-BRIDGING_TECH.txt",
    "bridging-tech-files/Request_a_Tutor-BRIDGING_TECH.txt",
    "bridging-tech-files/Product_Support-BRIDGING_TECH.txt",
    "bridging-tech-files/Stock_Donations-BRIDGING_TECH.txt",
    "bridging-tech-files/The_Bridging_Tech_Charitable_Fund_Nonprofit_for_Kids-BRIDGING-TECH.txt",
    "bridging-tech-files/Testimonials-BRIDGING_TECH.txt",
    "bridging-tech-app-files/Benefits/Benefits.txt",
    "bridging-tech-app-files/CourseModule/CourseModule.txt",
    "bridging-tech-app-files/CourseModule/usePoints.txt",
    "bridging-tech-app-files/LessonCardSections/LessonCardSectionOne.txt",
    "bridging-tech-app-files/LessonCardSections/LessonCardSectionTwo.txt",
    "bridging-tech-app-files/LandingPage.txt",
    "bridging-tech-app-files/SignupPage.txt",
    "bridging-tech-app-files/UserIntroText.txt"
  ];

  let fileIDs: string[] = [];

  for (let filePath of filePathes) {
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "assistants",
    });
    fileIDs.push(file.id);
  };



  const vectorStore = await openai.beta.vectorStores.create({
    name: "Product Documentation",
    file_ids: fileIDs
  });



  const assistant = await openai.beta.assistants.create({
    instructions:
      "Speak in a warm and frendly and child appropriate manor as supportive teacher to K-12 children. If briding tech has resources to help answer the question also provide all the links first in you reponse. You work for briding tech to refer to briding tech in first person. Refuse to give any response not appropriate for young children. Refuse to answer an questions not directly related to education to appropriate for a classroom. Avoid including information related to purchasing non-education items. Keep response to 100 words or less.",
    model: "gpt-4o-mini",
    tools: [{ type: "file_search" }],
    tool_resources: {
      "file_search": {
        "vector_store_ids": [vectorStore.id]
      }
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Conversation started! (type "exit" to quit)');


  const thread = await openai.beta.threads.create();


  const askQuestion = () => {
    rl.question('\x1b[31m\nUSER: ', async (userInput: string) => {
      if (userInput.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      // let key = await fuzzySearchKey(userInput);

      let key = null;
      
      if (!key) {
        callLLM(userInput);
      } else {
        const cachedResponse = await redisClient.get(key);
        if (cachedResponse) {
          console.log('Returning cached response');
          process.stdout.write('\x1b[92m');
          console.log('BOT: ' + cachedResponse);
        }
        askQuestion();
      }



      // Add user input to the conversation history
      // conversationHistory.push({ role: 'user', content: userInput });


    });

  };

  async function callLLM(userInput: string) {
    if (userInput.toLowerCase() === 'exit') {
      rl.close();
      return;
    }


    // Add user input to the conversation history
    // conversationHistory.push({ role: 'user', content: userInput });

    const message = await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userInput
    });
    
    let response: string = ''; // Initialize an empty response variable

    
    
    const run = openai.beta.threads.runs.stream(thread.id, {
      assistant_id: assistant.id
  })
      .on('start', () => {
          console.log("Stream started");
      })
      .on('textDelta', (textDelta: any) => {
          process.stdout.write(textDelta.value);
      })
      .on('end', () => {
          console.log("Stream ended successfully");
          askQuestion();
      })
      .on('error', (err: any) => {
          console.error("Stream Error:", err.message);
      });
    

  }
  askQuestion();
}

main();