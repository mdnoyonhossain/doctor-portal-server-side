const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ mesage: 'unAuthorized' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden' })
        }
        req.decoded = decoded;
        next()
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.n3a0m.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollecton = client.db('doctorsPortal').collection('bookings');
        const usersCollecton = client.db('doctorsPortal').collection('users');
        const doctorsCollecton = client.db('doctorsPortal').collection('doctors');

        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            // get the booking of the provide date 
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollecton.find(bookingQuery).toArray();
            // code Cairful 
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookedSlot = optionBooked.map(book => book.slot);
                const reminingSlots = option.slots.filter(slot => !bookedSlot.includes(slot));
                option.slots = reminingSlots;
            })
            res.send(options);
        });

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })

        // Booking API 

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decoded = req.decoded.email;
            if (email !== decoded) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const query = { email: email };
            const bookings = await bookingsCollecton.find(query).toArray();
            res.send(bookings);
        });

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollecton.findOne(query);
            res.send(booking);
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment,
            };
            const alreadyBooked = await bookingsCollecton.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollecton.insertOne(booking);
            res.send(result);
        });

        app.post("/create-payment-intent", async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;
            
            const paymentIntent = await stripe.paymentIntents.create({
              currency: "usd",
              amount: amount,
              "payment_method_types": [
                "card"
              ]
            });
          
            res.send({
              clientSecret: paymentIntent.client_secret,
            });
          });

        // User API

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollecton.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' });
                return res.send({ accessToken: token });
            }
            res.send({ accessToken: '' });
        })

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollecton.find(query).toArray();
            res.send(users)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollecton.insertOne(user);
            res.send(result);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollecton.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollecton.findOne(query);
            if (user?.role !== 'admin') {
                res.status(403).send({ message: 'forbidden access' })
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await usersCollecton.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // temporary data added 
        // app.get('/doctors', async (req, res) => {
        //     const filter = {};
        //     const options = {upsert: true}
        //     const updatedDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // })

        app.get('/doctors', async (req, res) => {
            const query = {};
            const doctor = await doctorsCollecton.find(query).toArray();
            res.send(doctor);
        })

        app.post('/doctors', async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollecton.insertOne(doctor);
            res.send(result);
        })

        app.delete('/doctors/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await doctorsCollecton.deleteOne(filter);
            res.send(result);
        })

    }
    finally {

    }
}
run().catch(error => console.log(error))

app.get('/', (req, res) => {
    res.send('Doctors Portal Server is Running');
})

app.listen(port, () => {
    console.log(`Doctors portal server on port ${port}`);
})