const express = require('express');
const bodyParser = require("body-parser");
const https = require("https")
const ejs = require("ejs");
const mongoose = require("mongoose");
const path = require('path');
const sharp = require('sharp');
const multer = require('multer');
const axios = require('axios');
const Redis = require('redis');
const compression = require('compression');
require('dotenv').config();
const AWS = require('aws-sdk');



const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Set up Redis client
const redisClient = Redis.createClient({});

const s3 = new AWS.S3();

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(compression());

const clientID = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET
const refreshToken = process.env.REFRESH_TOKEN
const tokenType = process.env.TOKEN_TYPE
const accountId = process.env.ACCOUNT_ID
const accountUsername = process.env.ACCOUNT_USERNAME
const mongoDBURL = process.env.MONGODB_URI

let accessToken = null;
let tokenLastFetchedTime = null;
const TOKEN_EXPIRY_DURATION_MS = 28 * 24 * 60 * 60 * 1000; // 28 days in milliseconds

async function fetchAccessToken(clientId, clientSecret) {
    try {
        const response = await axios.post('https://api.imgur.com/oauth2/token', {
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
        });
        
        if (response.data && response.data.access_token) {
            accessToken = response.data.access_token;
            tokenLastFetchedTime = Date.now();
            console.log('Access token fetched successfully.');
        } else {
            console.error('Failed to fetch access token from Imgur API.');
        }
    } catch (error) {
        console.error('Error fetching access token:', error);
    }
}

async function ensureToken(req, res, next) {
    try {
        if (!accessToken || !tokenLastFetchedTime || (Date.now() - tokenLastFetchedTime) > TOKEN_EXPIRY_DURATION_MS) {
            console.log('Access token expired or not available. Fetching new token...');
            await fetchAccessToken(clientID, clientSecret);
        }
        console.log('Token checked, proceeding...');
        next();
    } catch (error) {
        console.error('Error in ensureToken middleware:', error);
        res.redirect('/');
    }
}



// Fetch all images from S3 bucket and cache the result
async function fetchAndCacheImagesFromS3() {
    try {
        const cachedImages = await getFromCache('images');
        if (cachedImages) {
            console.log('All images fetched from cache');
            return JSON.parse(cachedImages);
        }

        const allImages = await fetchAllImagesFromS3();

        // Cache all images in Redis with a TTL of 3600 seconds (1 hour)
        await setInCacheWithExpiration('images', JSON.stringify(allImages), 3600);

        console.log('All images fetched from S3 and cached');
        return allImages;
    } catch (error) {
        console.error('Error fetching all images:', error);
        return [];
    }
}

// Fetch all images from S3 bucket
async function fetchAllImagesFromS3() {
    try {
        const params = {
            Bucket: process.env.BUCKET,
        };

        const objects = await s3.listObjectsV2(params).promise();
        console.log(objects)
        imageUrls = []
        objects.Contents.map(obj => {
            const imageUrl = s3.getSignedUrl('getObject', {
                Bucket: process.env.CYCLIC_BUCKET_NAME,
                Key: obj.Key,
                // Add any additional parameters as needed
            });
            imageUrls.push(imageUrl);
        });

        return imageUrls;
    } catch (error) {
        console.error('Error fetching images from S3:', error);
        return [];
    }
}

// Retrieve a value from the Redis cache
async function getFromCache(key) {
    return new Promise((resolve, reject) => {
        redisClient.get(key, (err, reply) => {
            if (err) {
                reject(err);
            } else {
                resolve(reply);
            }
        });
    });
}

// Set a value in the Redis cache
async function setInCache(key, value) {
    return new Promise((resolve, reject) => {
        redisClient.set(key, value, (err, reply) => {
            if (err) {
                reject(err);
            } else {
                resolve(reply);
            }
        });
    });
}

// Set a value in the Redis cache with expiration
async function setInCacheWithExpiration(key, value, seconds) {
    return new Promise((resolve, reject) => {
        redisClient.setex(key, seconds, value, (err, reply) => {
            if (err) {
                reject(err);
            } else {
                resolve(reply);
            }
        });
    });
}
async function clearCache() {
    return new Promise((resolve, reject) => {
        redisClient.flushdb((err, succeeded) => {
            if (err) {
                reject(err);
            } else {
                console.log('Cache cleared successfully');
                resolve();
            }
        });
    });
}






const albumHashes = [{
    name: 'photoshoots',
    hash: 'jwn4DPl'
}, {
    name: 'graduation',
    hash: 'LXNraCR'
}, {
    name: 'pregnancy',
    hash: 'hzyo7Fn'
}, {
    name: 'family',
    hash: '7AbOjou'
}, {
    name: 'creative',
    hash: 'GrnEXll'
}, {
    name: 'children',
    hash: 'PFDlB2A'
}, {
    name: 'event',
    hash: 'ShX8W9o'
}, {
    name: 'wedding',
    hash: 'RZVXrPP'
}];

const contachHash = 'DhgDWQS';
const aboutMeHash = 'cpEEnIy';

mongoose.set("strictQuery", false);
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

const informationSchema = new mongoose.Schema({
    name: String,
    email: String,
    number: String,
    address: String,
    instagram: String,
    twitter: String,
    telegram: String,
    facebook: String,
    aboutMeInfo: String,
    bio: String,
});

const Information = mongoose.model('Information', informationSchema);


const fetchAdminInfo = async (req, res, next) => {
    try {
        const adminInfo = await Information.findOne();
        res.locals.adminInfo = adminInfo;
        next();
    } catch (error) {
        console.error('Error fetching admin information:', error);
        res.status(500).send('Internal Server Error');
    }
};

app.use(fetchAdminInfo);

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]; // Swap elements at i and j
    }
    return array;
  }

app.get('/', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();

        // Shuffling all images
        const shuffledImages = shuffleArray(allImages);
        console.log(shuffledImages)

        res.render('index', { myImages: shuffledImages, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).send('Error fetching images');
    }
});

app.get('/contact', async (req, res) => {
    try {
        const response = await axios.get(`https://api.imgur.com/3/account/abdur28/album/${contachHash}`, {
            headers: {
                'Authorization': `Client-ID ${clientID}`
            }
        });

        const data = response.data.data.images;
        const imageUrls = data.map(image => image.link);

        res.render('contact', { images: imageUrls, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.get('/about-me', async (req, res) => {
    try {
        const response = await axios.get(`https://api.imgur.com/3/account/abdur28/album/${aboutMeHash}`, {
            headers: {
                'Authorization': `Client-ID ${clientID}`
            }
        });

        const data = response.data.data.images;
        const imageUrls = data.map(image => image.link);

        res.render('about_me', { images: imageUrls, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.get('/gallery', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();

        // Group images by album
        const albums = [];
        const albumMap = new Map(); // Using a map to ensure albums are unique
        allImages.forEach(image => {
            const [albumName, imageName] = image.key.split('/');
            if (!albumMap.has(albumName)) {
                albumMap.set(albumName, []);
                albums.push({ name: albumName, images: albumMap.get(albumName) });
            }
            albumMap.get(albumName).push({ name: imageName, url: image.url });
        });

        res.render('gallery', { albums });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});


app.get('/iamtheowner01-admin', function (req, res) {
    res.render('admin', { adminInfo: res.locals.adminInfo });
});

app.post('/iamtheowner01-admin', async (req, res) => {
    try {
        const { address, number, email, instagram, twitter, telegram, facebook, aboutMeInfo, bio } = req.body;
        const { adminInfo } = res.locals;

        adminInfo.address = address.trim() || adminInfo.address;
        adminInfo.number = number.trim() || adminInfo.number;
        adminInfo.email = email.trim() || adminInfo.email;
        adminInfo.instagram = instagram.trim() || adminInfo.instagram;
        adminInfo.twitter = twitter.trim() || adminInfo.twitter;
        adminInfo.telegram = telegram.trim() || adminInfo.telegram;
        adminInfo.facebook = facebook.trim() || adminInfo.facebook;
        adminInfo.aboutMeInfo = aboutMeInfo.trim() || adminInfo.aboutMeInfo;
        adminInfo.bio = bio.trim() || adminInfo.bio;

        await adminInfo.save();

        res.redirect('/')
    } catch (error) {
        console.error('Error updating admin information:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/iamtheowner01-admin-gallery-edit', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();

      // Group images by album
        const albums = [];
        const albumMap = new Map(); // Using a map to ensure albums are unique
        allImages.forEach(image => {
            const [albumName, imageName] = image.key.split('/');
            if (!albumMap.has(albumName)) {
                albumMap.set(albumName, []);
                albums.push({ name: albumName, images: albumMap.get(albumName) });
            }
            albumMap.get(albumName).push({ name: imageName, url: image.url });
        });
        
        res.render('gallery_edit', { admins, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.delete('/delete-image/:album/:imageName', async (req, res) => {
    try {
        const { album, imageName } = req.params;

        const params = {
            Bucket: process.env.CYCLIC_BUCKET_NAME,
            Key: `${album}/${imageName}`
        };

        await s3.deleteObject(params).promise();

        console.log("Deleted from S3:", params.Key);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting image from S3:', error);
        res.status(500).json({ error: 'Error deleting image from S3' });
    }
});

// Upload image to S3 bucket and associate it with an album
app.put('/add-image', upload.single('image'), async (req, res) => {
    try {
        const album = req.body.album;

        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        // Resize and optimize image with quality 90 using Sharp
        const optimizedImageBuffer = await sharp(file.buffer)
            .jpeg({ quality: 90 })
            .toBuffer();

        const params = {
            Bucket: process.env.CYCLIC_BUCKET_NAME,
            Key: `${album}/${file.originalname}`,
            Body: optimizedImageBuffer, // Use the optimized image buffer
            ContentType: file.mimetype
        };

        const uploadResult = await s3.upload(params).promise();

        console.log("Uploaded to S3:", uploadResult.Location);
        res.status(200).json({ imageUrl: uploadResult.Location });
    } catch (error) {
        console.error('Error uploading image to S3:', error);
        res.status(500).json({ error: 'Error uploading image to S3' });
    }
});


const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log("listening for requests");
    });
});

