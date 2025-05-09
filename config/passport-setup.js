const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth2").Strategy;
const LocalStrategy = require("passport-local");
const keys = require("./keys");
const User = require("../models/UserModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id).then((user) => {
    done(null, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: keys.google.clientID,
      clientSecret: keys.google.clientSecret,
      callbackURL: "http://localhost:3000/auth/google/redirect",
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = await new User({
            googleId: profile.id,
            username: profile.displayName,
            email: profile.email,
          }).save();
        }

        // Thêm access và refresh token
        const access_token = jwt.sign({ id: user.id }, "access-secret", {
          expiresIn: "15m",
        });

        const refresh_token = jwt.sign({ id: user.id }, "refresh-secret", {
          expiresIn: "7d",
        });

        // Gắn vào req để xử lý ở controller
        req.tokens = { access_token, refresh_token };
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Find the user by username in the database
      const user = await User.findOne({ username });
      // If the user does not exist, return an error
      if (!user) {
        return done(null, false, { error: "Incorrect username" });
      }

      // Compare the provided password with the
      // hashed password in the database
      const passwordsMatch = await bcrypt.compare(password, user.password);

      // If the passwords match, return the user object
      if (passwordsMatch) {
        return done(null, user);
      } else {
        // If the passwords don't match, return an error
        return done(null, false, { error: "Incorrect password" });
      }
    } catch (err) {
      return done(err);
    }
  })
);
module.exports = passport;
