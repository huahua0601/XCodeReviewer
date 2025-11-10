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
### Clone XCodeReviewer

```
git clone https://github.com/huahua0601/XCodeReviewer.git
```
### switch to develop
```
cd XCodeReviewer
git checkout develop
```
### install requirements
```
pip install -r requirements.txt
```