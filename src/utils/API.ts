import axios from 'axios';

export default axios.create({ baseURL: '', proxy: { host: '', port: 5000 } });
