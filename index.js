const express = require("express");
const util = require('util');
const routes = require("./routes/productos")
const { engine } = require('express-handlebars');
const mongoose = require('mongoose');
const { normalize, schema } = require('normalizr');
const MensajeDB = require('./models/mensajes')
const session = require('express-session');
const MongoStore = require('connect-mongo');
const advancedOptions = { useNewUrlParser: true, useUnifiedTopology: true };
const routes_controller = require('./routes/controllers/productos.controller');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const route = require('./route'); 
const {obtenerUsuario, obtenerUsuarioId, passwordValida} = require('./utils/util');
const bCrypt = require('bCrypt');

const app = express();
const PORT = 8080;
const http = require("http").Server(app);
const io = require('socket.io')(http);
const usuarios = [];

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", routes)
const cookieParser = require('cookie-parser');
app.use(cookieParser("clave-secreta"));
app.use(session({
  store: MongoStore.create({
    mongoUrl: 'mongodb+srv://nikong:nikong22!@cluster0.z6il9.mongodb.net/?retryWrites=true&w=majority',
    mongoOptions: advancedOptions
  }),
  secret: 'secreto',
  resave: false,
  saveUninitialized: false,
  // cookie: { maxAge: 5000 }
}));
app.set('views', './views'); // especifica el directorio de vistas
app.set('view engine', 'hbs'); // registra el motor de plantillas

app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "index.hbs",
    layoutsDir: __dirname + "/views/layouts",
    partialsDir: __dirname + "/views/partials"
  })
);

let server;
server = http.listen(PORT, () =>
  console.log(`Servidor HTTP escuando en el puerto ${PORT}`)
);

app.use('/', (req, res, next) => {
  if (req.cookies.username) {
    const username = req.cookies.username
    res.cookie('username', username, { signed: false, maxAge: 5000 });
  }
  express.static('public')(req, res, next);
  if (req.session.contador) {
    req.session.contador++;
    //  res.send(`Ud. ha visitado el sitio ${req.session.contador} veces`);
  } else {
    req.session.contador = 1;
    //  res.send('Bienvenido!');
  }
});


function print(objeto) {
  console.log(util.inspect(objeto, false, 12, true))
}

io.on('connection', async (socket) => {
  console.log('alguien se está conectado...');
  const productos = await routes_controller.getProductos()

  let mensajes = await MensajeDB.find({})
    .then((mensajes) => {
      return mensajes
    })

  const chat = {
    id: 123,
    mensajes: mensajes
  };

  io.sockets.emit('listar', productos);

  socket.on('notificacion', (title, price, thumbnail) => {
    const producto = {
      title: title,
      price: price,
      thumbnail: thumbnail,
    };
    producto.push(productos);
    console.log(producto)

    io.sockets.emit('listar', productos)
  })

  console.log('normalizr:')
  console.log(mensajes)

  const mensajeSchema = new schema.Entity('mensajes');

  const chatSchema = new schema.Entity('chat', {
    mensajes: [mensajeSchema]
  });

  const normalizedChat = normalize(chat, chatSchema);

  // print(normalizedChat);
  console.log('Longitud antes de normalizar:', JSON.stringify(chat).length);
  console.log('Longitud después de normalizar:', JSON.stringify(normalizedChat).length);
  io.sockets.emit('mensajes', mensajes, JSON.stringify(chat).length, JSON.stringify(normalizedChat).length);

  socket.on('nuevo', (data) => {
    MensajeDB.insertMany([data])
      .then((id_insertado) => {
        mensajes['id'] = id_insertado[0];
        mensajes.push(data);
        console.log('Longitud antes de normalizar:', JSON.stringify(chat).length);
        console.log('Longitud después de normalizar:', JSON.stringify(normalizedChat).length);
        io.sockets.emit('mensajes', mensajes, JSON.stringify(chat).length, JSON.stringify(normalizedChat).length);
        console.log(`Mensajes grabados...`);

      });
  })

});


//passport

passport.use('login', new LocalStrategy({
  passReqToCallback: true
},
  function(req, username, password, done){
    User.findOne({ 'username' : username },
      function (err, user){
        if (err)
          return done(err);
        if (!user){
          console.log('user not found ' +username);
          return done(null, false,
            console.log('message', 'user not found'));
          }
        if(!isValidPassword(user, password)){
          console.log('Invalid password');
          return done (null, false,
            console.log('mensage', 'Invalid Password'));
          }
        return done (null, user);
      }
     );
    })
  );

  const isValidPassword = function(user, password){
    return bCrypt.compareSync(password, user.password);
  }
  
passport.use('signup', new LocalStrategy({
    passReqToCallback: true
  },
  function (req, username, password, done){
    findOrCreateUser = function(){
      User.findOne({'username' : username}, function(err, user) {
        if (err){
          console.log('Error en SignUp: ' +err);
          return done(err);
        }
        if (user) {
          console.log('User already exists');
          return done (null, false,
            console.log('message', 'User Already Exists'));
        } else {
          var newUser = new User();
          newUser.username = username;
          newUser.password = createHash(password);
          newUser.email = req.body.email;
          newUser.firstName = req.body.firstName;
          newUser.lastName = req.body.lastName;
          newUser.save(function(err){
            if (err){
              console.log('Error in Saving user: '+err);
              throw err;
            }
            console.log('User Registration succesful');
            return done(null, newUser);
          });
        }
      });
    }
    process.nextTick(findOrCreateUser);
  })
)
var createHash = function(password){
  return bCrypt.hashSync(password, bCrypt.genSaltSync(10), null);
}
  

passport.serializeUser(function(user, done) {
  done(null, user._id);
});
  
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user){
    done(err, user);
  });
});
  

app.get('/test', (req,res)=>{
    res.send('Server levantado...');
});

app.get('/login', routes.getLogin);
app.post('/login', passport.authenticate('login', {failureRedirect: '/faillogin'}), routes.postLogin);
app.get('/faillogin', routes.getFailLogin);

app.get('/signup', routes.getSignUp);
app.post('/signup', passport.authenticate('signup', {failureRedirect: '/failsignup'}), routes.postSignUp);
app.get('/failsignup', routes.getFailSignUp);

app.get('/logout', routes.getLogout);

app.get('/ruta-protegida', checkAuthentication, routes.getRutaProtegida);

app.get('/datos', routes.getDatos);

app.get('*', routes.failRoute);

function checkAuthentication(req, res, next){
    if (req.isAuthenticated()){
        next();
    } else {
        res.redirect('/');
    }
}