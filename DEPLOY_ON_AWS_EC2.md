### Install Conda on EC2
```
sudo yum update -y
sudo yum install -y wget
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
bash miniconda.sh -b -p $HOME/miniconda3
$HOME/miniconda3/bin/conda init
source ~/.bashrc
```
### Verify Conda Version
```
conda --version
python --version
```
### Create code ENV
```
conda create -n code python=3.11
conda activate code
```
### Install Git
```
sudo dnf install git -y
```
### Install Docker

```
sudo dnf install docker -y
sudo systemctl start docker
sudo systemctl enable docker
docker --version
```
### Add User to Group 

```
sudo usermod -aG docker $USER
newgrp docker  
```

### Install Docker Compose
```
# 下载并安装 compose 插件
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 验证
docker compose version
```

### Clone XCodeReviewer

```
git clone https://github.com/huahua0601/XCodeReviewer.git
```
### switch to develop
```
cd XCodeReviewer
git checkout develop
```
### Copy env 
```
cd backend
cp .env.production .env
```
### Modify DB endpoint and Redis Endpoint in .env

### Start Service

```
./force-rebuild.sh
```

### Set ollama public access
```
sudo mkdir -p /etc/systemd/system/ollama.service.d

# 创建环境变量配置文件
sudo tee /etc/systemd/system/ollama.service.d/environment.conf > /dev/null <<EOF
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

sudo systemctl daemon-reload

# 重启 Ollama 服务
sudo systemctl restart ollama
```
### Validate Ollama

```
sudo systemctl status ollama

# 2. 检查监听地址（应该看到 0.0.0.0:11434）
sudo ss -tlnp | grep 11434

# 3. 测试本地访问
curl -s http://localhost:11434/api/tags | head -20

# 4. 测试内网 IP 访问
curl -s http://172.31.13.85:11434/api/tags | head -20
```