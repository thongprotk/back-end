const mongoose = require('mongoose');

async function connectToDB() {
    try {
        mongoose.set('strictQuery', false)
        await mongoose.connect('mongodb+srv://buitrungt242:tnRDkWfZ2CABiAcq@test.tmzp2kk.mongodb.net/Web-node-socket',
            {
                tls: true,
            }
        );
        console.log('Connected to DB');
    } catch (error) {
        console.log(error);
        process.exit()
    }
}

module.exports = { connectToDB };