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
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_KEY
    }
});

const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Set up Redis client
const redisClient = Redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD // If authentication is enabled
});

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
        // console.log(objects);
        
        const imageUrls = []; // Declare an array to store image URLs

        // Iterate over the objects
        objects.Contents.forEach(obj => {
            const key = obj.Key;
            
            // Check if the key ends with a picture type (e.g., .jpg, .png)
            const pictureTypes = ['.jpg', '.jpeg', '.png', '.gif']; // Add more if needed
            const endsWithPictureType = pictureTypes.some(type => key.toLowerCase().endsWith(type));
            
            // If it doesn't end with a picture type, skip this object
            if (!endsWithPictureType) {
                return;
            }
            
            // Split key by '/' to get albumName and imageName
            const [albumName, imageName] = key.split('/');
            
            // Generate a signed URL for the image
            const imageUrl = s3.getSignedUrl('getObject', {
                Bucket: process.env.BUCKET,
                Key: key,
                // Add any additional parameters as needed
            });
            
            // Push albumName, imageName, and imageUrl as an object
            imageUrls.push({ albumName, imageName, imageUrl });
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
    aboutPhoto: String,
    aboutMeInfo: String,
    bio: String,
});

const reviewSchema = new mongoose.Schema({
    name: String,
    review: String,
});

const Information = mongoose.model('Information', informationSchema);
const Review = mongoose.model('Review', reviewSchema);



const fetchAdminInfo = async (req, res, next) => {
    try {
        const adminInfo = await Information.findOne();
        const reviews = await Review.find();
        res.locals.reviews = reviews;
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
        // Filter out contact and about me images
        const filteredImages = allImages.filter(image => image.albumName !== 'contact' && image.albumName !== 'about_me');
        // Shuffling filtered images
        const shuffledImages = shuffleArray(filteredImages);

        res.render('index', { images: shuffledImages, adminInfo: res.locals.adminInfo, reviews: res.locals.reviews });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).send('Error fetching images');
    }
});

app.post('/', async (req, res) => {
    try {
        const { name, review } = req.body;
        const reviewCard = new Review({
            name: name,
            review: review
        });

        await reviewCard.save();

        res.redirect('/');
    } catch (error) {
        console.error('Error saving review:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.delete('/delete-review/:id', async (req, res) => {
    try {
        const reviewId = req.params.id;

        // Find the review by ID and delete it
        const deletedReview = await Review.findByIdAndDelete(reviewId);
        if (!deletedReview) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Respond with a success message
        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


app.get('/contact', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();
        const contactAlbum = allImages.filter(image => image.albumName === 'contact');
        res.render('contact', { contactAlbum, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.post('/contact', (req, res) => {
    const { email, name, message, myEmail } = req.body;

    // Prepare the email message
    const mailOptions = {
        from: 'Jerry J photography <abdurrahmanidris235@gmail.com>',
        to: myEmail,
        subject: `New Message from Website`,
        html: `<html><p>You got a new message from ${name}</p><p>Email: ${email}</p><p>Message: ${message}</p></html>`
    };

    // Send the email
    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.error('Error sending email:', error);
            res.status(500).json({ error: 'Error sending email' });
        } else {
            console.log('Email sent successfully');
            res.status(200).json({ message: 'Email sent successfully' });
        }
    });
});

app.get('/about-me', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();
        const aboutMeAlbum = allImages.filter(image => image.albumName === 'about_me');
        res.render('about_me', { aboutMeAlbum, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.get('/gallery', async (req, res) => {
    try {
        const allImages = await fetchAllImagesFromS3();
        const filteredImages = allImages.filter(image => image.albumName !== 'contact' && image.albumName !== 'about_me');
        const shuffledImages = shuffleArray(filteredImages);

        // Group images by album
        const albumsMap = new Map(); // Using a map to ensure albums are unique
        allImages.forEach(image => {
            const { albumName, imageName } = image;
            if (albumName !== 'contact' && albumName !== 'about_me') { // Exclude the "contact" album
                if (!albumsMap.has(albumName)) {
                    albumsMap.set(albumName, []);
                }
                albumsMap.get(albumName).push({ name: imageName, url: image.imageUrl });
            }
        });

        const albums = Array.from(albumsMap, ([name, images]) => ({ name, images }));

        res.render('gallery', { albums, images: shuffledImages });
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
        const { address, number, email, instagram, twitter, telegram, facebook, aboutMeInfo, aboutPhoto, bio } = req.body;
        const { adminInfo } = res.locals;

        adminInfo.address = address.trim() || adminInfo.address;
        adminInfo.number = number.trim() || adminInfo.number;
        adminInfo.email = email.trim() || adminInfo.email;
        adminInfo.instagram = instagram.trim() || adminInfo.instagram;
        adminInfo.twitter = twitter.trim() || adminInfo.twitter;
        adminInfo.telegram = telegram.trim() || adminInfo.telegram;
        adminInfo.facebook = facebook.trim() || adminInfo.facebook;
        adminInfo.aboutPhoto = aboutPhoto.trim() || adminInfo.aboutPhoto;
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
        const albumsMap = new Map(); // Using a map to ensure albums are unique
        allImages.forEach(image => {
            const { albumName, imageName } = image;
            if (albumName !== 'contact' && albumName !== 'about_me') { // Exclude the "contact" album
                if (!albumsMap.has(albumName)) {
                    albumsMap.set(albumName, []);
                }
                albumsMap.get(albumName).push({ name: imageName, url: image.imageUrl });
            }
        });

        const albums = Array.from(albumsMap, ([name, images]) => ({ name, images }));


        const contactAlbum = allImages.filter(image => image.albumName === 'contact');
        const aboutMeAlbum = allImages.filter(image => image.albumName === 'about_me');
        

        
        res.render('gallery_edit', { albums, contactAlbum, aboutMeAlbum, adminInfo: res.locals.adminInfo });
    } catch (error) {
        console.error('Error fetching album images:', error);
        res.status(500).send('Error fetching album images');
    }
});

app.delete('/delete-image/:album/:imageName', async (req, res) => {
    try {
        const { album, imageName } = req.params;

        const params = {
            Bucket: process.env.BUCKET,
            Key: `${album}/${imageName}`
        };

        await s3.deleteObject(params).promise();
        // clearCache();

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

        // Rename the file based on the album name
        let fileName;
        if (album === 'contact') {
            fileName = 'contact_pic.jpg';
        } else if (album === 'about_me') {
            fileName = 'about_me_pic.jpg';
        } else {
            fileName = file.originalname; // Use original file name if not contact or about_me
        }

        // Resize and optimize image with quality 90 using Sharp
        const optimizedImageBuffer = await sharp(file.buffer)
            .jpeg({ quality: 90 })
            .toBuffer();

        const params = {
            Bucket: process.env.BUCKET,
            Key: `${album}/${fileName}`, // Use the adjusted file name
            Body: optimizedImageBuffer, // Use the optimized image buffer
            ContentType: file.mimetype
        };

        const uploadResult = await s3.upload(params).promise();
        // clearCache();

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


